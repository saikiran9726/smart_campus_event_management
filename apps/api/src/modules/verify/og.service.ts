import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { env } from '../../env';
import { buildKey, r3Client } from '../../lib/r2';
import { PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { db } from '../../db/client';
import { certificates } from '../../db/schema';
import { eq } from 'drizzle-orm';

let cachedFont: Buffer | null = null;

function loadFont(): Buffer {
  if (cachedFont) return cachedFont;
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const possiblePaths = [
    path.resolve(currentDir, '../../../assets/fonts/Inter-Regular.ttf'),
    path.resolve(process.cwd(), 'apps/api/assets/fonts/Inter-Regular.ttf'),
    path.resolve(process.cwd(), 'assets/fonts/Inter-Regular.ttf'),
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      cachedFont = fs.readFileSync(p);
      return cachedFont;
    }
  }
  throw new Error('Inter-Regular font file not found for OG card rendering.');
}

export interface RenderOgCardParams {
  certId: string;
  holderName: string;
  eventTitle: string;
  clubName: string;
  kind: string;
  rank?: number | null;
  issuedAt: string;
}

export async function renderOgCardPng(params: RenderOgCardParams): Promise<Buffer> {
  const fontData = loadFont();

  const isWinner = params.kind === 'WINNER';
  let badgeText = 'Certificate of Participation';
  let badgeBg = '#EEF2FF';
  let badgeBorder = '#6366F1';
  let badgeColor = '#4338CA';

  if (isWinner) {
    badgeBg = '#FEF3C7';
    badgeBorder = '#F59E0B';
    badgeColor = '#B45309';
    if (params.rank === 1) badgeText = '1st Place Winner';
    else if (params.rank === 2) badgeText = '2nd Place Winner';
    else if (params.rank === 3) badgeText = '3rd Place Winner';
    else if (params.rank) badgeText = `Rank #${params.rank} Winner`;
    else badgeText = 'Winner';
  }

  const satoriFn = typeof satori === 'function' ? satori : (satori as any).default;

  const svg = await satoriFn(
    {
      type: 'div',
      props: {
        style: {
          display: 'flex',
          flexDirection: 'column',
          width: '1200px',
          height: '630px',
          backgroundColor: '#FFFFFF',
          fontFamily: 'Inter',
        },
        children: [
          // Indigo #4338CA Header Band
          {
            type: 'div',
            props: {
              style: {
                display: 'flex',
                height: '96px',
                backgroundColor: '#4338CA',
                padding: '0 48px',
                alignItems: 'center',
                justifyContent: 'space-between',
              },
              children: [
                {
                  type: 'span',
                  props: {
                    style: {
                      color: '#FFFFFF',
                      fontSize: '28px',
                      fontWeight: 'bold',
                      letterSpacing: '1px',
                    },
                    children: 'EVENTORA',
                  },
                },
                {
                  type: 'span',
                  props: {
                    style: {
                      color: '#E0E7FF',
                      fontSize: '18px',
                      fontWeight: 'bold',
                      letterSpacing: '1px',
                    },
                    children: 'OFFICIAL VERIFIED CREDENTIAL',
                  },
                },
              ],
            },
          },

          // Main Certificate Body
          {
            type: 'div',
            props: {
              style: {
                display: 'flex',
                flexDirection: 'column',
                flex: 1,
                padding: '48px',
                justifyContent: 'center',
              },
              children: [
                {
                  type: 'span',
                  props: {
                    style: {
                      color: '#64748B',
                      fontSize: '18px',
                      fontWeight: 'bold',
                      letterSpacing: '2px',
                    },
                    children: 'THIS CERTIFIES THAT',
                  },
                },
                {
                  type: 'span',
                  props: {
                    style: {
                      color: '#0F172A',
                      fontSize: '48px',
                      fontWeight: 'bold',
                      marginTop: '8px',
                    },
                    children: params.holderName,
                  },
                },
                {
                  type: 'span',
                  props: {
                    style: {
                      color: '#4338CA',
                      fontSize: '28px',
                      fontWeight: 'bold',
                      marginTop: '16px',
                    },
                    children: params.eventTitle,
                  },
                },
                {
                  type: 'span',
                  props: {
                    style: {
                      color: '#64748B',
                      fontSize: '20px',
                      marginTop: '8px',
                    },
                    children: `Organized by ${params.clubName}`,
                  },
                },
                {
                  type: 'div',
                  props: {
                    style: {
                      display: 'flex',
                      alignItems: 'center',
                      marginTop: '20px',
                      backgroundColor: badgeBg,
                      border: `2px solid ${badgeBorder}`,
                      borderRadius: '8px',
                      padding: '8px 20px',
                      alignSelf: 'flex-start',
                    },
                    children: [
                      {
                        type: 'span',
                        props: {
                          style: {
                            color: badgeColor,
                            fontSize: '20px',
                            fontWeight: 'bold',
                          },
                          children: badgeText,
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },

          // Footer Band
          {
            type: 'div',
            props: {
              style: {
                display: 'flex',
                height: '64px',
                backgroundColor: '#F8FAFC',
                borderTop: '1px solid #E2E8F0',
                padding: '0 48px',
                alignItems: 'center',
                justifyContent: 'space-between',
              },
              children: [
                {
                  type: 'span',
                  props: {
                    style: {
                      color: '#4338CA',
                      fontSize: '16px',
                      fontWeight: 'bold',
                    },
                    children: 'Verified by Eventora',
                  },
                },
                {
                  type: 'span',
                  props: {
                    style: {
                      color: '#94A3B8',
                      fontSize: '14px',
                    },
                    children: `Verification ID: ${params.certId}`,
                  },
                },
              ],
            },
          },
        ],
      },
    },
    {
      width: 1200,
      height: 630,
      fonts: [
        {
          name: 'Inter',
          data: fontData,
          weight: 400,
          style: 'normal',
        },
      ],
    }
  );

  const resvg = new Resvg(svg, {
    fitTo: {
      mode: 'width',
      value: 1200,
    },
  });

  return resvg.render().asPng();
}

/**
 * Gets or generates the OG card PNG for a certificate.
 */
export async function getOrGenerateCertificateOgPng(
  certId: string,
  meta: RenderOgCardParams
): Promise<Buffer> {
  const pngBuffer = await renderOgCardPng(meta);

  // Upload to R2 in background or if not in test
  const ogKey = buildKey('og-cards', meta.certId, 'og.png');
  if (env.NODE_ENV !== 'test') {
    try {
      await r3Client.send(
        new PutObjectCommand({
          Bucket: env.R2_BUCKET,
          Key: ogKey,
          Body: pngBuffer,
          ContentType: 'image/png',
        })
      );
      await db
        .update(certificates)
        .set({ ogImageKey: ogKey })
        .where(eq(certificates.id, certId));
    } catch (err) {
      // Continue even if R2 upload fails
    }
  }

  return pngBuffer;
}
