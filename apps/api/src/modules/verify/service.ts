import { and, desc, eq, isNotNull } from 'drizzle-orm';
import { db } from '../../db/client';
import {
  auditLogs,
  certificates,
  clubMembers,
  clubs,
  eventResources,
  events,
  odLetters,
  registrations,
  reviews,
  tickets,
  users,
  User,
} from '../../db/schema';
import { env } from '../../env';
import { AppError } from '../../lib/app-error';

export function toPascalCase(str: string): string {
  return str
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, chr) => chr.toUpperCase())
    .replace(/^[a-z]/, (chr) => chr.toUpperCase());
}

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export async function getCertificateDetails(certId: string) {
  const [cert] = await db
    .select({
      id: certificates.id,
      userId: certificates.userId,
      eventId: certificates.eventId,
      kind: certificates.kind,
      rank: certificates.rank,
      issuedAt: certificates.issuedAt,
      ogImageKey: certificates.ogImageKey,
    })
    .from(certificates)
    .where(eq(certificates.id, certId))
    .limit(1);

  if (!cert) {
    throw new AppError('NOT_FOUND', `Certificate '${certId}' not found.`, 404);
  }

  // Check if certificate has been revoked in persistent audit history
  const [revocation] = await db
    .select({
      actorId: auditLogs.actorId,
      createdAt: auditLogs.createdAt,
      diff: auditLogs.diff,
    })
    .from(auditLogs)
    .where(
      and(
        eq(auditLogs.entity, 'certificate'),
        eq(auditLogs.entityId, certId),
        eq(auditLogs.action, 'CERTIFICATE_REVOKED')
      )
    )
    .limit(1);

  if (revocation) {
    throw new AppError(
      'NOT_FOUND',
      `Certificate '${certId}' has been officially revoked.`,
      404,
      {
        revokedAt: revocation.createdAt,
        reason: (revocation.diff as any)?.reason || 'Revoked by authority',
      }
    );
  }

  const [user] = await db
    .select({
      fullName: users.fullName,
    })
    .from(users)
    .where(eq(users.id, cert.userId))
    .limit(1);

  const [event] = await db
    .select({
      id: events.id,
      title: events.title,
      slug: events.slug,
      clubId: events.clubId,
    })
    .from(events)
    .where(eq(events.id, cert.eventId))
    .limit(1);

  const [club] = await db
    .select({
      id: clubs.id,
      name: clubs.name,
      slug: clubs.slug,
    })
    .from(clubs)
    .where(eq(clubs.id, event?.clubId ?? '00000000-0000-0000-0000-000000000000'))
    .limit(1);

  return {
    id: cert.id,
    userId: cert.userId,
    holderName: user?.fullName || 'Participant',
    event: {
      id: event?.id || cert.eventId,
      title: event?.title || 'Campus Event',
      slug: event?.slug || 'event',
    },
    club: {
      name: club?.name || 'Campus Club',
      slug: club?.slug || 'club',
    },
    kind: cert.kind,
    rank: cert.rank,
    issuedAt: cert.issuedAt.toISOString(),
    ogImageKey: cert.ogImageKey,
  };
}

export async function getCertificateOgHtml(certId: string): Promise<string> {
  const details = await getCertificateDetails(certId);

  const achievement =
    details.kind === 'WINNER'
      ? details.rank === 1
        ? 'Winner (1st Place)'
        : details.rank
          ? `Winner (Rank #${details.rank})`
          : 'Winner'
      : 'Certificate of Participation';

  const title = `${details.holderName} - ${achievement} | ${details.event.title}`;
  const description = `Verified credential issued to ${details.holderName} for ${details.event.title} organized by ${details.club.name} on Eventora.`;

  const baseUrl = env.PUBLIC_API_URL || 'http://localhost:3001';
  const imageUrl = `${baseUrl}/og/cert/${certId}.png`;
  const shareUrl = `${baseUrl}/share/cert/${certId}`;
  const spaUrl = `${env.PUBLIC_WEB_URL}/verify/cert/${certId}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:image" content="${imageUrl}">
  <meta property="og:url" content="${shareUrl}">
  <meta name="twitter:card" content="summary_large_image">
  <script>
    window.location.replace("${spaUrl}");
  </script>
</head>
<body style="font-family:sans-serif;text-align:center;padding:50px;">
  <h2>Eventora Verified Credential</h2>
  <p>Redirecting to verification page... <a href="${spaUrl}">Click here if not redirected</a>.</p>
</body>
</html>`;
}

export async function getCertificateShareData(certId: string, currentUserId: string) {
  const details = await getCertificateDetails(certId);

  // Determine achievement wording
  let achievement = 'participated in';
  if (details.kind === 'WINNER') {
    if (details.rank === 1) achievement = 'won 1st place at';
    else if (details.rank === 2) achievement = 'won 2nd place at';
    else if (details.rank === 3) achievement = 'won 3rd place at';
    else if (details.rank) achievement = `won rank #${details.rank} at`;
    else achievement = 'won at';
  }

  const caption = `Excited to share that I ${achievement} ${details.event.title} organised by ${details.club.name}! Verified on Eventora.`;
  const clubSlugPascal = toPascalCase(details.club.slug || 'Club');
  const hashtags = `#Eventora #CampusLife #${clubSlugPascal}`;

  const baseUrl = env.PUBLIC_API_URL || 'http://localhost:3001';
  const shareUrl = `${baseUrl}/share/cert/${certId}`;
  const linkedinUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`;

  return {
    linkedinUrl,
    caption,
    hashtags,
    shareUrl,
  };
}

export async function getUserPassport(userId: string) {
  // Query all registrations for user that have checked in
  const attendedRows = await db
    .select({
      registrationId: registrations.id,
      eventId: events.id,
      eventTitle: events.title,
      eventSlug: events.slug,
      startAt: events.startAt,
      endAt: events.endAt,
      clubId: events.clubId,
      ticketId: tickets.id,
      checkedInAt: tickets.checkedInAt,
    })
    .from(registrations)
    .innerJoin(events, eq(registrations.eventId, events.id))
    .innerJoin(tickets, eq(tickets.registrationId, registrations.id))
    .where(
      and(
        eq(registrations.userId, userId),
        isNotNull(tickets.checkedInAt)
      )
    )
    .orderBy(desc(events.startAt));

  const passport = [];

  for (const row of attendedRows) {
    // Club info
    const [club] = await db
      .select({ name: clubs.name, slug: clubs.slug })
      .from(clubs)
      .where(eq(clubs.id, row.clubId))
      .limit(1);

    // Certificate
    const [cert] = await db
      .select({
        id: certificates.id,
        kind: certificates.kind,
        rank: certificates.rank,
        issuedAt: certificates.issuedAt,
      })
      .from(certificates)
      .where(
        and(
          eq(certificates.eventId, row.eventId),
          eq(certificates.userId, userId)
        )
      )
      .limit(1);

    let activeCert = cert || null;
    if (cert) {
      const [isRevoked] = await db
        .select({ id: auditLogs.id })
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.entity, 'certificate'),
            eq(auditLogs.entityId, cert.id),
            eq(auditLogs.action, 'CERTIFICATE_REVOKED')
          )
        )
        .limit(1);
      if (isRevoked) {
        activeCert = null;
      }
    }

    // OD letter
    const [od] = await db
      .select({
        id: odLetters.id,
        serial: odLetters.serial,
        issuedAt: odLetters.issuedAt,
      })
      .from(odLetters)
      .where(
        and(
          eq(odLetters.eventId, row.eventId),
          eq(odLetters.userId, userId)
        )
      )
      .limit(1);

    // Review
    const [rev] = await db
      .select({
        id: reviews.id,
        stars: reviews.stars,
        comment: reviews.comment,
        createdAt: reviews.createdAt,
      })
      .from(reviews)
      .where(
        and(
          eq(reviews.eventId, row.eventId),
          eq(reviews.userId, userId)
        )
      )
      .limit(1);

    // Resources
    const resources = await db
      .select({
        id: eventResources.id,
        title: eventResources.title,
        kind: eventResources.kind,
        resourceKey: eventResources.resourceKey,
        url: eventResources.url,
      })
      .from(eventResources)
      .where(eq(eventResources.eventId, row.eventId));

    passport.push({
      event: {
        id: row.eventId,
        title: row.eventTitle,
        slug: row.eventSlug,
        startAt: row.startAt.toISOString(),
        endAt: row.endAt.toISOString(),
        club: {
          name: club?.name || 'Club',
          slug: club?.slug || 'club',
        },
      },
      ticket: {
        id: row.ticketId,
        registrationId: row.registrationId,
        checkedInAt: row.checkedInAt!.toISOString(),
      },
      certificate: activeCert
        ? {
            id: activeCert.id,
            kind: activeCert.kind,
            rank: activeCert.rank,
            issuedAt: activeCert.issuedAt.toISOString(),
          }
        : null,
      odLetter: od
        ? {
            id: od.id,
            serial: od.serial,
            issuedAt: od.issuedAt.toISOString(),
          }
        : null,
      review: rev
        ? {
            id: rev.id,
            stars: rev.stars,
            comment: rev.comment,
            createdAt: rev.createdAt.toISOString(),
          }
        : null,
      resources,
    });
  }

  return { passport };
}

export async function addEventResource(
  eventId: string,
  userId: string,
  data: {
    title: string;
    kind: string;
    resourceKey?: string;
    url?: string;
  }
) {
  if (!data.resourceKey && !data.url) {
    throw new AppError('VALIDATION_FAILED', 'Either resourceKey or url must be provided.', 400);
  }

  const [resource] = await db
    .insert(eventResources)
    .values({
      eventId,
      title: data.title,
      kind: data.kind,
      resourceKey: data.resourceKey || null,
      url: data.url || null,
    })
    .returning();

  return resource;
}

export async function getEventResourcesForUser(eventId: string, userId: string, role?: string) {
  // Check if user is admin / faculty
  const isPrivileged = role === 'SUPER_ADMIN' || role === 'CAMPUS_ADMIN' || role === 'FACULTY';

  if (!isPrivileged) {
    // Check if user has checked in to this event
    const [ticket] = await db
      .select({ checkedInAt: tickets.checkedInAt })
      .from(tickets)
      .innerJoin(registrations, eq(tickets.registrationId, registrations.id))
      .where(
        and(
          eq(registrations.eventId, eventId),
          eq(registrations.userId, userId)
        )
      )
      .limit(1);

    if (!ticket || !ticket.checkedInAt) {
      throw new AppError(
        'NOT_CHECKED_IN',
        'Resource vault is accessible only to attendees who checked in to the event.',
        403
      );
    }
  }

  const resources = await db
    .select({
      id: eventResources.id,
      title: eventResources.title,
      kind: eventResources.kind,
      resourceKey: eventResources.resourceKey,
      url: eventResources.url,
      createdAt: eventResources.createdAt,
    })
    .from(eventResources)
    .where(eq(eventResources.eventId, eventId))
    .orderBy(eventResources.createdAt);

  return { resources };
}

export async function revokeCertificate(certId: string, actor: User, reason?: string) {
  const [cert] = await db
    .select({
      id: certificates.id,
      eventId: certificates.eventId,
      userId: certificates.userId,
    })
    .from(certificates)
    .where(eq(certificates.id, certId))
    .limit(1);

  if (!cert) {
    throw new AppError('NOT_FOUND', `Certificate '${certId}' not found.`, 404);
  }

  // Check if certificate has been revoked in persistent audit history
  const [revocation] = await db
    .select({
      actorId: auditLogs.actorId,
      createdAt: auditLogs.createdAt,
      diff: auditLogs.diff,
    })
    .from(auditLogs)
    .where(
      and(
        eq(auditLogs.entity, 'certificate'),
        eq(auditLogs.entityId, certId),
        eq(auditLogs.action, 'CERTIFICATE_REVOKED')
      )
    )
    .limit(1);

  if (revocation) {
    throw new AppError(
      'CONFLICT',
      `Certificate '${certId}' has already been revoked.`,
      409,
      {
        revokedAt: revocation.createdAt,
        reason: (revocation.diff as any)?.reason || 'Revoked by authority',
      }
    );
  }

  // Check authorization: Admin, Club Owner/Admin, or Faculty coordinator
  let isAuthorized = actor.role === 'ADMIN';

  if (!isAuthorized) {
    const [event] = await db
      .select({ clubId: events.clubId })
      .from(events)
      .where(eq(events.id, cert.eventId))
      .limit(1);

    if (event) {
      const [membership] = await db
        .select({ role: clubMembers.role })
        .from(clubMembers)
        .where(and(eq(clubMembers.clubId, event.clubId), eq(clubMembers.userId, actor.id)))
        .limit(1);

      if (membership && (membership.role === 'OWNER' || membership.role === 'ADMIN')) {
        isAuthorized = true;
      }

      if (!isAuthorized && actor.role === 'FACULTY') {
        const [club] = await db
          .select({ facultyCoordinatorId: clubs.facultyCoordinatorId })
          .from(clubs)
          .where(eq(clubs.id, event.clubId))
          .limit(1);
        if (club && club.facultyCoordinatorId === actor.id) {
          isAuthorized = true;
        }
      }
    }
  }

  if (!isAuthorized) {
    throw new AppError('FORBIDDEN', 'You do not have permission to revoke this certificate.', 403);
  }

  // Preserve certificate record; record persistent revocation state, timestamp, actor and reason in audit history
  const now = new Date();
  await db.insert(auditLogs).values({
    actorId: actor.id,
    action: 'CERTIFICATE_REVOKED',
    entity: 'certificate',
    entityId: certId,
    diff: {
      eventId: cert.eventId,
      recipientUserId: cert.userId,
      revokedBy: actor.id,
      revokedAt: now.toISOString(),
      reason: reason || 'Revoked by authority',
    },
  });

  return { success: true, message: 'Certificate successfully revoked.' };
}
