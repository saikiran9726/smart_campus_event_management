import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import {
  ChannelKind,
  ClubMemberRole,
  EventStatus,
  generateOpaqueToken,
  ProposalStatus,
  QuestionType,
  RegistrationStatus,
  TicketStatus,
  UserRole,
} from '@eventora/shared';
import { db, pool } from './client';
import {
  avResources,
  budgetAllocations,
  clubChannels,
  clubMembers,
  clubs,
  eventProposals,
  events,
  expenseItems,
  formQuestions,
  registrations,
  tickets,
  users,
  venues,
} from './schema';

export async function runSeed(): Promise<void> {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEMO_SEED !== 'true') {
    console.error('❌ Refusing to run demo seed in production without ALLOW_DEMO_SEED=true');
    process.exit(1);
  }
  console.log('Seeding Eventora database...');

  // 1. Seed Users
  const [adminUser] = await db
    .insert(users)
    .values({
      clerkId: 'user_admin_001',
      email: 'admin@eventora.campus.edu',
      fullName: 'System Administrator',
      rollNumber: 'ADM-001',
      department: 'Campus IT Administration',
      year: 4,
      role: UserRole.ADMIN,
      phone: '+91 9876543210',
    })
    .onConflictDoUpdate({
      target: users.email,
      set: {
        clerkId: 'user_admin_001',
        fullName: 'System Administrator',
        role: UserRole.ADMIN,
        strikeCount: 0,
        consecutiveNoShows: 0,
        cooldownUntil: null,
        deletedAt: null,
      },
    })
    .returning();

  const [facultyAdvisor] = await db
    .insert(users)
    .values({
      clerkId: 'user_faculty_001',
      email: 'dr.sharma@eventora.campus.edu',
      fullName: 'Dr. Ramesh Sharma',
      department: 'Computer Science & Engineering',
      role: UserRole.FACULTY,
      phone: '+91 9876543211',
    })
    .onConflictDoUpdate({
      target: users.email,
      set: {
        clerkId: 'user_faculty_001',
        fullName: 'Dr. Ramesh Sharma',
        role: UserRole.FACULTY,
        strikeCount: 0,
        consecutiveNoShows: 0,
        cooldownUntil: null,
        deletedAt: null,
      },
    })
    .returning();

  const [organizerUser] = await db
    .insert(users)
    .values({
      clerkId: 'user_organizer_001',
      email: 'priya.patel@eventora.campus.edu',
      fullName: 'Priya Patel',
      rollNumber: 'CS23B101',
      department: 'Computer Science & Engineering',
      year: 3,
      role: UserRole.ORGANIZER,
      phone: '+91 9876543212',
    })
    .onConflictDoUpdate({
      target: users.email,
      set: {
        clerkId: 'user_organizer_001',
        fullName: 'Priya Patel',
        role: UserRole.ORGANIZER,
        strikeCount: 0,
        consecutiveNoShows: 0,
        cooldownUntil: null,
        deletedAt: null,
      },
    })
    .returning();

  const [organizerNoClubUser] = await db
    .insert(users)
    .values({
      clerkId: 'user_organizer_no_club',
      email: 'alex.noclub@eventora.campus.edu',
      fullName: 'Alex Solo Organizer',
      rollNumber: 'CS23B199',
      department: 'Information Technology',
      year: 3,
      role: UserRole.ORGANIZER,
      phone: '+91 9876543299',
    })
    .onConflictDoUpdate({
      target: users.email,
      set: {
        clerkId: 'user_organizer_no_club',
        fullName: 'Alex Solo Organizer',
        role: UserRole.ORGANIZER,
        strikeCount: 0,
        consecutiveNoShows: 0,
        cooldownUntil: null,
        deletedAt: null,
      },
    })
    .returning();

  const [studentUser] = await db
    .insert(users)
    .values({
      clerkId: 'user_student_001',
      email: 'arjun.mehta@eventora.campus.edu',
      fullName: 'Arjun Mehta',
      rollNumber: 'CS24B042',
      department: 'Electrical Engineering',
      year: 2,
      role: UserRole.STUDENT,
      phone: '+91 9876543213',
    })
    .onConflictDoUpdate({
      target: users.email,
      set: {
        clerkId: 'user_student_001',
        fullName: 'Arjun Mehta',
        role: UserRole.STUDENT,
        strikeCount: 0,
        consecutiveNoShows: 0,
        cooldownUntil: null,
        deletedAt: null,
      },
    })
    .returning();

  const adminId =
    adminUser?.id ??
    (await db.select({ id: users.id }).from(users).where(eq(users.email, 'admin@eventora.campus.edu')))[0]?.id;
  const facultyId =
    facultyAdvisor?.id ??
    (await db.select({ id: users.id }).from(users).where(eq(users.email, 'dr.sharma@eventora.campus.edu')))[0]?.id;
  const organizerId =
    organizerUser?.id ??
    (await db.select({ id: users.id }).from(users).where(eq(users.email, 'priya.patel@eventora.campus.edu')))[0]?.id;
  const studentId =
    studentUser?.id ??
    (await db.select({ id: users.id }).from(users).where(eq(users.email, 'arjun.mehta@eventora.campus.edu')))[0]?.id;

  // 2. Seed Venues
  const [auditorium] = await db
    .insert(venues)
    .values({
      name: 'Main Campus Auditorium',
      capacity: 1200,
      locationText: 'Central Block, Ground Floor',
      mapUrl: 'https://maps.campus.edu/venues/main-auditorium',
    })
    .onConflictDoNothing({ target: venues.name })
    .returning();

  const [seminarHall] = await db
    .insert(venues)
    .values({
      name: 'Seminar Hall 1',
      capacity: 250,
      locationText: 'Aryabhatta Building, 2nd Floor',
      mapUrl: 'https://maps.campus.edu/venues/seminar-hall-1',
    })
    .onConflictDoNothing({ target: venues.name })
    .returning();

  const auditoriumId =
    auditorium?.id ??
    (await db.select({ id: venues.id }).from(venues).where(eq(venues.name, 'Main Campus Auditorium')))[0]?.id;
  const seminarHallId =
    seminarHall?.id ??
    (await db.select({ id: venues.id }).from(venues).where(eq(venues.name, 'Seminar Hall 1')))[0]?.id;

  await db
    .insert(venues)
    .values([
      {
        name: 'Open Air Theatre (OAT)',
        capacity: 2500,
        locationText: 'Student Activity Complex',
        mapUrl: 'https://maps.campus.edu/venues/oat',
      },
      {
        name: 'Sports Complex Indoor Arena',
        capacity: 800,
        locationText: 'South Campus Sports Arena',
        mapUrl: 'https://maps.campus.edu/venues/sports-indoor',
      },
    ])
    .onConflictDoNothing();

  // 3. Seed AV Resources
  await db
    .insert(avResources)
    .values([
      {
        name: 'Laser 4K Projector',
        kind: 'PROJECTOR',
        quantity: 4,
      },
      {
        name: 'Wireless UHF Collar/Handheld Mics (Set of 4)',
        kind: 'MIC',
        quantity: 10,
      },
      {
        name: 'Line-Array Concert Sound System',
        kind: 'SOUND_SYSTEM',
        quantity: 2,
      },
      {
        name: '4K PTZ Broadcast Streaming Cameras',
        kind: 'CAMERA',
        quantity: 6,
      },
    ])
    .onConflictDoNothing();

  // 4. Seed Clubs
  if (organizerId && facultyId) {
    const [codingClub] = await db
      .insert(clubs)
      .values({
        name: 'CodeChef & Devs Campus Club',
        slug: 'codechef-devs',
        description:
          'Premier software development, algorithmic competitive programming, and hackathon organization hub on campus.',
        logoKey: 'clubs/logos/codechef-devs.png',
        bannerKey: 'clubs/banners/codechef-devs-banner.jpg',
        facultyCoordinatorId: facultyId,
        createdBy: organizerId,
      })
      .onConflictDoNothing({ target: clubs.slug })
      .returning();

    const [roboticsClub] = await db
      .insert(clubs)
      .values({
        name: 'Robotics and Embedded Systems Guild',
        slug: 'robotics-guild',
        description:
          'Dedicated to autonomous bots, IoT sensor integration, and national drone competitions.',
        logoKey: 'clubs/logos/robotics.png',
        bannerKey: 'clubs/banners/robotics-banner.jpg',
        facultyCoordinatorId: facultyId,
        createdBy: organizerId,
      })
      .onConflictDoNothing({ target: clubs.slug })
      .returning();

    // 5. Seed Club Members and Default Channels
    const codingClubRecord =
      codingClub ??
      (await db.select().from(clubs).where(eq(clubs.slug, 'codechef-devs')))[0];

    const roboticsClubRecord =
      roboticsClub ??
      (await db.select().from(clubs).where(eq(clubs.slug, 'robotics-guild')))[0];

    for (const clubRecord of [codingClubRecord, roboticsClubRecord]) {
      if (!clubRecord) continue;

      // Ensure club has faculty coordinator assigned
      if (!clubRecord.facultyCoordinatorId && facultyId) {
        await db
          .update(clubs)
          .set({ facultyCoordinatorId: facultyId })
          .where(eq(clubs.id, clubRecord.id));
      }

      await db
        .insert(clubMembers)
        .values([
          {
            clubId: clubRecord.id,
            userId: organizerId,
            role: ClubMemberRole.OWNER,
          },
          ...(studentId
            ? [
                {
                  clubId: clubRecord.id,
                  userId: studentId,
                  role: ClubMemberRole.MEMBER,
                },
              ]
            : []),
        ])
        .onConflictDoNothing();

      // Seed Default Club Channels (Announcements, General, Events)
      await db
        .insert(clubChannels)
        .values([
          {
            clubId: clubRecord.id,
            kind: ChannelKind.ANNOUNCEMENTS,
            name: 'Announcements',
            slug: 'announcements',
          },
          {
            clubId: clubRecord.id,
            kind: ChannelKind.GENERAL,
            name: 'General',
            slug: 'general',
          },
          {
            clubId: clubRecord.id,
            kind: ChannelKind.EVENTS,
            name: 'Events',
            slug: 'events',
          },
        ])
        .onConflictDoNothing();
    }

    if (codingClubRecord) {
      // 6. Seed Proposal and Event
      const now = new Date();
      const startTime = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const endTime = new Date(startTime.getTime() + 8 * 60 * 60 * 1000);
      const regOpen = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const regClose = new Date(startTime.getTime() - 2 * 60 * 60 * 1000);

      const [proposal] = await db
        .insert(eventProposals)
        .values({
          clubId: codingClubRecord.id,
          proposedBy: organizerId,
          title: 'HackCampus 2026: 24-Hour National Hackathon',
          description:
            'A 24-hour inter-collegiate coding challenge focusing on AI systems, web platforms, and mobile apps.',
          expectedAttendance: 400,
          venueId: auditoriumId,
          startAt: startTime,
          endAt: endTime,
          status: ProposalStatus.APPROVED,
          facultyId: facultyId,
          decidedAt: now,
          decisionNote: 'Approved. Ensure proper security and catering arrangements.',
        })
        .onConflictDoNothing()
        .returning();

      const [hackathonEvent] = await db
        .insert(events)
        .values({
          clubId: codingClubRecord.id,
          proposalId: proposal?.id,
          title: 'HackCampus 2026: 24-Hour National Hackathon',
          slug: 'hackcampus-2026',
          category: 'Hackathon',
          description:
            'Join hundreds of student developers, designers, and engineers for 24 hours of innovation and building. Categories include Generative AI, Campus Systems, and Sustainable Tech.',
          venueId: auditoriumId,
          startAt: startTime,
          endAt: endTime,
          registrationOpensAt: regOpen,
          registrationClosesAt: regClose,
          status: EventStatus.PUBLISHED,
          capacity: 400,
          remainingCapacity: 350,
          pricePaise: 0,
          isPaid: false,
          isCompetition: true,
          minTeamSize: 2,
          maxTeamSize: 4,
          createdBy: organizerId,
        })
        .onConflictDoNothing({ target: events.slug })
        .returning();

      const hackathonEventRecord =
        hackathonEvent ??
        (await db.select().from(events).where(eq(events.slug, 'hackcampus-2026')))[0];

      if (hackathonEventRecord) {
        // Seed Form Questions
        await db
          .insert(formQuestions)
          .values([
            {
              eventId: hackathonEventRecord.id,
              position: 1,
              type: QuestionType.SHORT_TEXT,
              label: 'GitHub Profile or Portfolio URL',
              helpText: 'Link to your public code repositories or portfolio',
              required: true,
              validation: { minLength: 5, maxLength: 255 },
            },
            {
              eventId: hackathonEventRecord.id,
              position: 2,
              type: QuestionType.MULTI_SELECT,
              label: 'Preferred Technology Stacks',
              required: true,
              options: [
                'Fullstack TypeScript',
                'Python & AI/ML',
                'Mobile (React Native/Flutter)',
                'DevOps & Cloud',
              ],
              validation: { minSelect: 1, maxSelect: 3 },
            },
            {
              eventId: hackathonEventRecord.id,
              position: 3,
              type: QuestionType.FILE_UPLOAD,
              label: 'Resume (PDF format)',
              required: false,
              validation: {
                maxFileBytes: 5242880,
                allowedMime: ['application/pdf'],
              },
            },
          ])
          .onConflictDoNothing();

        // Seed Event Channels
        await db
          .insert(clubChannels)
          .values([
            {
              eventId: hackathonEventRecord.id,
              kind: ChannelKind.EVENTS,
              name: 'HackCampus General',
              slug: 'hackcampus-general',
            },
            {
              eventId: hackathonEventRecord.id,
              kind: ChannelKind.DOUBT,
              name: 'Help & Mentorship Q&A',
              slug: 'hackcampus-help',
            },
          ])
          .onConflictDoNothing();

        // Seed Budget Allocation
        const [allocation] = await db
          .insert(budgetAllocations)
          .values({
            clubId: codingClubRecord.id,
            eventId: hackathonEventRecord.id,
            allocatedPaise: 15000000, // Rs. 1,50,000
            note: 'Budget approved by Student Affairs for HackCampus 2026',
          })
          .returning();

        if (allocation && organizerId) {
          await db
            .insert(expenseItems)
            .values([
              {
                allocationId: allocation.id,
                category: 'CATERING',
                description: 'Midnight snacks and morning breakfast for 400 attendees',
                amountPaise: 4500000, // Rs. 45,000
                receiptKey: 'receipts/catering_advance_001.pdf',
                signedOffBy: facultyId,
                signedOffAt: now,
              },
              {
                allocationId: allocation.id,
                category: 'PRIZES',
                description: 'Winner track prize pool vouchers',
                amountPaise: 7500000, // Rs. 75,000
                receiptKey: 'receipts/prizes_allocation.pdf',
                signedOffBy: facultyId,
                signedOffAt: now,
              },
            ])
            .onConflictDoNothing();
        }

        // Seed Confirmed Registration and Ticket for studentUser
        if (studentId) {
          const [studentReg] = await db
            .insert(registrations)
            .values({
              eventId: hackathonEventRecord.id,
              userId: studentId,
              status: RegistrationStatus.CONFIRMED,
            })
            .onConflictDoNothing()
            .returning();

          const regRecord =
            studentReg ??
            (
              await db
                .select()
                .from(registrations)
                .where(eq(registrations.eventId, hackathonEventRecord.id))
            ).find((r) => r.userId === studentId);

          if (regRecord) {
            await db
              .insert(tickets)
              .values({
                registrationId: regRecord.id,
                eventId: hackathonEventRecord.id,
                userId: studentId,
                token: generateOpaqueToken(),
                status: TicketStatus.VALID,
              })
              .onConflictDoNothing();
          }
        }
      }
    }
  }

  console.log('Eventora database seeding completed successfully.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runSeed()
    .then(() => pool.end())
    .catch(async (error) => {
      console.error('Seeding failed:', error);
      await pool.end();
      process.exit(1);
    });
}
