import crypto from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import {
  EventStatus,
  UserRole,
} from '@eventora/shared';
import { db } from '../../db/client';
import {
  clubs,
  events,
  odLetters,
  registrations,
  tickets,
  users,
  venues,
} from '../../db/schema';
import { env } from '../../env';
import { AppError } from '../../lib/app-error';
import { buildKey, headObject, r3Client } from '../../lib/r2';
import { PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';

/**
 * Formats a Date object into IST string (Asia/Kolkata).
 */
export function formatIST(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(d);
}

/**
 * Computes deterministic HMAC-SHA256 signature over an OD letter sanction.
 */
export function computeOdSignature(
  serial: string,
  userId: string,
  eventId: string,
  checkedInAt: Date | string
): string {
  const isoCheckedInAt = typeof checkedInAt === 'string' ? checkedInAt : checkedInAt.toISOString();
  const payload = `${serial}|${userId}|${eventId}|${isoCheckedInAt}`;
  return crypto.createHmac('sha256', env.OD_SEAL_SECRET).update(payload).digest('hex');
}

/**
 * Generates an official A4 On-Duty (OD) attendance sanction letter PDF using PDFKit.
 */
export async function renderOdPdfBuffer(params: {
  serial: string;
  studentName: string;
  rollNumber: string;
  departmentYear: string;
  eventTitle: string;
  clubName: string;
  venueName: string;
  sessionWindow: string;
  checkedInAt: string;
  facultyName: string;
  signature: string;
  validationUrl: string;
  qrCodeBuffer: Buffer;
}): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 50,
      info: {
        Title: `On-Duty Sanction - ${params.serial}`,
        Author: 'Eventora Academic Affairs',
      },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', (err) => reject(err));

    // 1. College Header
    doc
      .fontSize(16)
      .font('Helvetica-Bold')
      .fillColor('#1E1B4B')
      .text('EVENTORA INSTITUTE OF TECHNOLOGY', { align: 'center' });

    doc
      .fontSize(10)
      .font('Helvetica')
      .fillColor('#4B5563')
      .text('Office of Academic Affairs & Student Welfare', { align: 'center' })
      .moveDown(0.3);

    doc
      .fontSize(9)
      .font('Helvetica')
      .fillColor('#6B7280')
      .text('Campus Event Operations Management System', { align: 'center' })
      .moveDown(0.8);

    // Decorative rule
    doc
      .strokeColor('#CBD5E1')
      .lineWidth(1)
      .moveTo(50, doc.y)
      .lineTo(545, doc.y)
      .stroke()
      .moveDown(1);

    // 2. Title Block
    doc
      .fontSize(13)
      .font('Helvetica-Bold')
      .fillColor('#4338CA')
      .text('OFFICIAL ON-DUTY (OD) ATTENDANCE SANCTION ORDER', { align: 'center' })
      .moveDown(0.4);

    doc
      .fontSize(9)
      .font('Helvetica-Bold')
      .fillColor('#374151')
      .text(`SANCTION SERIAL: ${params.serial}`, { align: 'center' })
      .moveDown(1.2);

    // 3. Student Details Section
    doc
      .fontSize(10)
      .font('Helvetica-Bold')
      .fillColor('#111827')
      .text('1. BENEFICIARY STUDENT DETAILS')
      .moveDown(0.3);

    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor('#374151')
      .text(`Student Name: ${params.studentName}`)
      .text(`Roll / Register Number: ${params.rollNumber}`)
      .text(`Department & Academic Year: ${params.departmentYear}`)
      .moveDown(1);

    // 4. Event & Session Window Details
    doc
      .fontSize(10)
      .font('Helvetica-Bold')
      .fillColor('#111827')
      .text('2. SANCTIONED EVENT SCHEDULE')
      .moveDown(0.3);

    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor('#374151')
      .text(`Event Title: ${params.eventTitle}`)
      .text(`Organizing Club / Chapter: ${params.clubName}`)
      .text(`Venue: ${params.venueName}`)
      .text(`Scheduled Session: ${params.sessionWindow} (IST)`)
      .text(`Verified Check-in Recorded: ${params.checkedInAt} (IST)`)
      .moveDown(1);

    // 5. Official Attestation Body
    doc
      .fontSize(9)
      .font('Helvetica')
      .fillColor('#1F2937')
      .text(
        'This is to certify that the aforementioned student was officially present and actively participated in the university event detailed above. Academic attendance for missed lectures and laboratories during this approved schedule is hereby sanctioned under university co-curricular regulations.',
        { align: 'justify', lineGap: 3 }
      )
      .moveDown(1.5);

    // 6. Faculty Coordinator Digital Seal & QR Code Block
    const sealTopY = doc.y;

    // Faculty Seal Box
    doc
      .roundedRect(50, sealTopY, 300, 110, 6)
      .fillAndStroke('#F8FAFC', '#4338CA');

    doc
      .fillColor('#4338CA')
      .fontSize(10)
      .font('Helvetica-Bold')
      .text('DIGITALLY APPROVED & SEALED', 65, sealTopY + 12)
      .font('Helvetica')
      .fontSize(9)
      .fillColor('#1F2937')
      .text(`Faculty Advisor: ${params.facultyName}`, 65, sealTopY + 32)
      .text('Authenticity: Cryptographically Signed (HMAC-SHA256)', 65, sealTopY + 50)
      .text(`Fingerprint: ${params.signature.slice(0, 16)}...`, 65, sealTopY + 68)
      .fillColor('#059669')
      .fontSize(8)
      .font('Helvetica-Bold')
      .text('VERIFIED ATTENDANCE RECORD', 65, sealTopY + 88);

    // Validation QR Code Image
    doc.image(params.qrCodeBuffer, 400, sealTopY, { width: 110, height: 110 });

    // 7. Footer
    doc
      .fontSize(8)
      .font('Helvetica')
      .fillColor('#6B7280')
      .text(
        `Verify online: ${params.validationUrl} | Serial: ${params.serial}`,
        50,
        750,
        { align: 'center', width: 495 }
      );

    doc.end();
  });
}

/**
 * Generates or returns an existing OD letter for a checked-in attendee.
 */
export async function generateOdLetter(userId: string, eventId: string) {
  // 1. Verify user exists
  const [user] = await db
    .select({
      id: users.id,
      fullName: users.fullName,
      rollNumber: users.rollNumber,
      department: users.department,
      year: users.year,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    throw new AppError('NOT_FOUND', 'User not found.', 404);
  }

  // 2. Load event, club, venue, and faculty coordinator
  const [event] = await db
    .select({
      id: events.id,
      title: events.title,
      status: events.status,
      startAt: events.startAt,
      endAt: events.endAt,
      clubId: events.clubId,
      venueId: events.venueId,
    })
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);

  if (!event) {
    throw new AppError('NOT_FOUND', `Event '${eventId}' not found.`, 404);
  }

  // 3. Verify user's ticket is CHECKED_IN
  const [ticket] = await db
    .select({
      id: tickets.id,
      checkedInAt: tickets.checkedInAt,
      status: tickets.status,
    })
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
    throw new AppError('NOT_CHECKED_IN', 'Attendance check-in is required before requesting an On-Duty letter.', 403);
  }

  // 4. Verify event timeframe: must have end_at <= now() OR be LIVE with checkin done
  const now = new Date();
  const isEligibleTime = event.endAt <= now || event.status === EventStatus.LIVE;
  if (!isEligibleTime) {
    throw new AppError('CONFLICT', 'OD letters can only be requested once the event is live or has concluded.', 409);
  }

  // 5. Check if OD letter already exists
  const [existingLetter] = await db
    .select()
    .from(odLetters)
    .where(and(eq(odLetters.eventId, eventId), eq(odLetters.userId, userId)))
    .limit(1);

  if (existingLetter) {
    return {
      letter: existingLetter,
      serial: existingLetter.serial,
      alreadyGenerated: true,
      downloadUrl: `/od/${existingLetter.id}.pdf`,
    };
  }

  // 6. Load club & faculty coordinator
  const [club] = await db
    .select({
      name: clubs.name,
      facultyCoordinatorId: clubs.facultyCoordinatorId,
    })
    .from(clubs)
    .where(eq(clubs.id, event.clubId))
    .limit(1);

  let facultyName = 'Faculty Coordinator';
  if (club?.facultyCoordinatorId) {
    const [faculty] = await db
      .select({ fullName: users.fullName })
      .from(users)
      .where(eq(users.id, club.facultyCoordinatorId))
      .limit(1);
    if (faculty) {
      facultyName = faculty.fullName;
    }
  }

  // Load venue name
  let venueName = 'Main Campus Auditorium';
  if (event.venueId) {
    const [venue] = await db
      .select({ name: venues.name })
      .from(venues)
      .where(eq(venues.id, event.venueId))
      .limit(1);
    if (venue) {
      venueName = venue.name;
    }
  }

  // 7. Generate serial: OD-YYYY-<8 hex>
  const yyyy = now.getFullYear();
  const hexPart = crypto.randomBytes(4).toString('hex').toUpperCase();
  const serial = `OD-${yyyy}-${hexPart}`;

  // 8. Compute HMAC signature
  const signature = computeOdSignature(serial, userId, eventId, ticket.checkedInAt);

  // 9. Generate QR code buffer
  const validationUrl = `${env.PUBLIC_WEB_URL}/verify/od/${serial}`;
  const qrCodeBuffer = await QRCode.toBuffer(validationUrl, {
    margin: 2,
    width: 200,
    errorCorrectionLevel: 'M',
  });

  // 10. Generate PDF buffer via PDFKit
  const pdfBuffer = await renderOdPdfBuffer({
    serial,
    studentName: user.fullName,
    rollNumber: user.rollNumber || 'N/A',
    departmentYear: `${user.department || 'Computer Science & Engineering'}, Year ${user.year || '3'}`,
    eventTitle: event.title,
    clubName: club?.name || 'Technical Club',
    venueName,
    sessionWindow: `${formatIST(event.startAt)} - ${formatIST(event.endAt)}`,
    checkedInAt: formatIST(ticket.checkedInAt),
    facultyName,
    signature,
    validationUrl,
    qrCodeBuffer,
  });

  // 11. Upload to R2 storage
  const pdfKey = buildKey('od', userId, `${serial}.pdf`);
  if (env.NODE_ENV !== 'test') {
    await r3Client.send(
      new PutObjectCommand({
        Bucket: env.R2_BUCKET,
        Key: pdfKey,
        Body: pdfBuffer,
        ContentType: 'application/pdf',
      })
    );
  }

  // 12. Save record in database
  const [createdLetter] = await db
    .insert(odLetters)
    .values({
      eventId,
      userId,
      serial,
      signature,
      pdfKey,
      issuedAt: now,
    })
    .returning();

  if (!createdLetter) {
    throw new AppError('CONFLICT', 'Failed to save OD letter record.', 500);
  }

  return {
    letter: createdLetter,
    serial,
    alreadyGenerated: false,
    downloadUrl: `/od/${createdLetter.id}.pdf`,
    pdfBuffer,
  };
}

/**
 * Verifies an OD letter publicly using HMAC cryptographic recomputation.
 */
export async function verifyOdLetterBySerial(serial: string) {
  const [letter] = await db
    .select({
      id: odLetters.id,
      serial: odLetters.serial,
      userId: odLetters.userId,
      eventId: odLetters.eventId,
      signature: odLetters.signature,
      issuedAt: odLetters.issuedAt,
    })
    .from(odLetters)
    .where(eq(odLetters.serial, serial))
    .limit(1);

  if (!letter) {
    throw new AppError('NOT_FOUND', `OD letter with serial '${serial}' not found.`, 404);
  }

  // Load ticket for check-in timestamp
  const [ticket] = await db
    .select({ checkedInAt: tickets.checkedInAt })
    .from(tickets)
    .innerJoin(registrations, eq(tickets.registrationId, registrations.id))
    .where(
      and(
        eq(registrations.eventId, letter.eventId),
        eq(registrations.userId, letter.userId)
      )
    )
    .limit(1);

  const checkedInAt = ticket?.checkedInAt ?? letter.issuedAt;

  // Recompute HMAC signature
  const expectedSignature = computeOdSignature(
    letter.serial,
    letter.userId,
    letter.eventId,
    checkedInAt
  );

  let valid = letter.signature === expectedSignature;

  // Support previous OD seal secret for zero-downtime key rotation
  if (!valid && env.OD_SEAL_SECRET_PREVIOUS && env.OD_SEAL_SECRET_PREVIOUS.length >= 32) {
    const isoCheckedInAt = typeof checkedInAt === 'string' ? checkedInAt : checkedInAt.toISOString();
    const payload = `${letter.serial}|${letter.userId}|${letter.eventId}|${isoCheckedInAt}`;
    const previousSignature = crypto.createHmac('sha256', env.OD_SEAL_SECRET_PREVIOUS).update(payload).digest('hex');
    valid = letter.signature === previousSignature;
  }

  // Load student & event details
  const [user] = await db
    .select({ fullName: users.fullName, rollNumber: users.rollNumber })
    .from(users)
    .where(eq(users.id, letter.userId))
    .limit(1);

  const [event] = await db
    .select({
      title: events.title,
      startAt: events.startAt,
      endAt: events.endAt,
      clubId: events.clubId,
    })
    .from(events)
    .where(eq(events.id, letter.eventId))
    .limit(1);

  const [club] = await db
    .select({ name: clubs.name })
    .from(clubs)
    .where(eq(clubs.id, event?.clubId ?? '00000000-0000-0000-0000-000000000000'))
    .limit(1);

  // Mask roll number: e.g. CS2026_1 -> CS2****_1
  let maskedRollNumber = 'N/A';
  if (user?.rollNumber) {
    const raw = user.rollNumber;
    if (raw.length > 4) {
      maskedRollNumber = `${raw.slice(0, 3)}****${raw.slice(-2)}`;
    } else {
      maskedRollNumber = `${raw.slice(0, 1)}**${raw.slice(-1)}`;
    }
  }

  return {
    valid,
    serial: letter.serial,
    studentName: user?.fullName || 'Student',
    maskedRollNumber,
    event: {
      title: event?.title || 'Campus Event',
      club: club?.name || 'Club',
      startAt: event?.startAt ? event.startAt.toISOString() : null,
      endAt: event?.endAt ? event.endAt.toISOString() : null,
    },
    issuedAt: letter.issuedAt.toISOString(),
  };
}

/**
 * Retrieves from R2 or renders the OD letter PDF buffer for download/streaming.
 */
export async function getOrRenderOdPdf(
  letterId: string
): Promise<{ buffer: Buffer; serial: string; userId: string }> {
  const [letter] = await db
    .select()
    .from(odLetters)
    .where(eq(odLetters.id, letterId))
    .limit(1);

  if (!letter) {
    throw new AppError('NOT_FOUND', 'On-Duty letter not found.', 404);
  }

  // 1. Try reading from R2 if not test
  if (env.NODE_ENV !== 'test' && letter.pdfKey) {
    try {
      const s3Response = await r3Client.send(
        new GetObjectCommand({
          Bucket: env.R2_BUCKET,
          Key: letter.pdfKey,
        })
      );
      if (s3Response.Body) {
        const chunks: Buffer[] = [];
        for await (const chunk of s3Response.Body as any) {
          chunks.push(Buffer.from(chunk));
        }
        return {
          buffer: Buffer.concat(chunks),
          serial: letter.serial,
          userId: letter.userId,
        };
      }
    } catch (err) {
      // Fallback to rendering
    }
  }

  // 2. Render fresh PDF buffer
  const [user] = await db
    .select({
      fullName: users.fullName,
      rollNumber: users.rollNumber,
      department: users.department,
      year: users.year,
    })
    .from(users)
    .where(eq(users.id, letter.userId))
    .limit(1);

  const [event] = await db
    .select({
      title: events.title,
      startAt: events.startAt,
      endAt: events.endAt,
      clubId: events.clubId,
      venueId: events.venueId,
    })
    .from(events)
    .where(eq(events.id, letter.eventId))
    .limit(1);

  const [club] = await db
    .select({
      name: clubs.name,
      facultyCoordinatorId: clubs.facultyCoordinatorId,
    })
    .from(clubs)
    .where(eq(clubs.id, event?.clubId ?? '00000000-0000-0000-0000-000000000000'))
    .limit(1);

  let facultyName = 'Faculty Coordinator';
  if (club?.facultyCoordinatorId) {
    const [faculty] = await db
      .select({ fullName: users.fullName })
      .from(users)
      .where(eq(users.id, club.facultyCoordinatorId))
      .limit(1);
    if (faculty) facultyName = faculty.fullName;
  }

  let venueName = 'Main Campus Auditorium';
  if (event?.venueId) {
    const [venue] = await db
      .select({ name: venues.name })
      .from(venues)
      .where(eq(venues.id, event.venueId))
      .limit(1);
    if (venue) venueName = venue.name;
  }

  const [ticket] = await db
    .select({ checkedInAt: tickets.checkedInAt })
    .from(tickets)
    .innerJoin(registrations, eq(tickets.registrationId, registrations.id))
    .where(
      and(
        eq(registrations.eventId, letter.eventId),
        eq(registrations.userId, letter.userId)
      )
    )
    .limit(1);

  const validationUrl = `${env.PUBLIC_WEB_URL}/verify/od/${letter.serial}`;
  const qrCodeBuffer = await QRCode.toBuffer(validationUrl, {
    margin: 2,
    width: 200,
    errorCorrectionLevel: 'M',
  });

  const pdfBuffer = await renderOdPdfBuffer({
    serial: letter.serial,
    studentName: user?.fullName || 'Student',
    rollNumber: user?.rollNumber || 'N/A',
    departmentYear: `${user?.department || 'Computer Science'}, Year ${user?.year || '3'}`,
    eventTitle: event?.title || 'Campus Event',
    clubName: club?.name || 'Technical Club',
    venueName,
    sessionWindow: `${formatIST(event?.startAt || new Date())} - ${formatIST(event?.endAt || new Date())}`,
    checkedInAt: formatIST(ticket?.checkedInAt || letter.issuedAt),
    facultyName,
    signature: letter.signature,
    validationUrl,
    qrCodeBuffer,
  });

  return {
    buffer: pdfBuffer,
    serial: letter.serial,
    userId: letter.userId,
  };
}
