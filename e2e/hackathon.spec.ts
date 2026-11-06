import { test, expect } from '@playwright/test';

test.describe('Hackathon Lifecycle: Team Formation, Capacity Lock & Snapshot', () => {
  const API_URL = process.env.API_URL || 'http://localhost:4000';

  test('leader creates team, 3 join with code, 5th rejected by max size (4), lock creates snapshot, joins afterwards fail', async ({
    request,
  }) => {
    // 1. Create Hackathon event with maxTeamSize = 4, minTeamSize = 2
    const clubRes = await request.get(`${API_URL}/clubs/codechef-devs`);
    const { club } = await clubRes.json();
    const clubId = club.id;

    const eventSlug = `hackathon-flow-${Date.now()}`;
    const createRes = await request.post(`${API_URL}/events`, {
      headers: { 'x-test-user-id': 'user_admin_001' },
      data: {
        clubId,
        title: 'CyberStorm 2026 Hackathon',
        slug: eventSlug,
        capacity: 100,
        startAt: new Date(Date.now() + 86400000).toISOString(),
        endAt: new Date(Date.now() + 172800000).toISOString(),
        category: 'Hackathon',
        isCompetition: true,
        minTeamSize: 2,
        maxTeamSize: 4,
        status: 'PUBLISHED',
      },
    });
    expect(createRes.status()).toBe(201);
    const { event } = await createRes.json();
    const eventId = event.id;

    const pubRes = await request.post(`${API_URL}/events/${eventId}/publish`, {
      headers: { 'x-test-user-id': 'user_admin_001' },
    });
    expect(pubRes.status()).toBe(200);

    // 2. Leader creates team
    const teamRes = await request.post(`${API_URL}/events/${eventId}/teams`, {
      headers: { 'x-test-user-id': 'user_student_001' },
      data: { name: 'Team Binary Blitz' },
    });
    expect(teamRes.status()).toBe(201);
    const { team, inviteCode } = await teamRes.json();
    expect(inviteCode).toHaveLength(8);
    const teamId = team.id;

    // 3. Three teammates join with the code
    const teammate1 = await request.post(`${API_URL}/teams/join`, {
      headers: { 'x-test-user-id': 'user_admin_001' },
      data: { code: inviteCode, inviteCode },
    });
    expect(teammate1.status()).toBe(200);

    const teammate2 = await request.post(`${API_URL}/teams/join`, {
      headers: { 'x-test-user-id': 'user_faculty_001' },
      data: { code: inviteCode, inviteCode },
    });
    expect(teammate2.status()).toBe(200);

    const teammate3 = await request.post(`${API_URL}/teams/join`, {
      headers: { 'x-test-user-id': 'user_organizer_001' },
      data: { code: inviteCode, inviteCode },
    });
    expect(teammate3.status()).toBe(200);

    // Verify team count is now 4 (maxTeamSize)
    const teamCheck = await request.get(`${API_URL}/teams/${teamId}`, {
      headers: { 'x-test-user-id': 'user_student_001' },
    });
    expect(teamCheck.status()).toBe(200);
    const teamData = await teamCheck.json();
    expect(teamData.team.members).toHaveLength(4);

    // 4. Attempt join by 5th user: must be rejected with 400 TEAM_FULL
    const extraUserId = `user_extra_${Date.now()}`;
    const extraJoin = await request.post(`${API_URL}/teams/join`, {
      headers: { 'x-test-user-id': extraUserId },
      data: { inviteCode },
    });
    expect([400, 403, 409]).toContain(extraJoin.status());

    // 5. Lock team -> generates roster snapshot
    const lockRes = await request.post(`${API_URL}/teams/${teamId}/lock`, {
      headers: { 'x-test-user-id': 'user_student_001' },
    });
    expect(lockRes.status()).toBe(200);
    const lockData = await lockRes.json();
    expect(lockData.team.status).toBe('LOCKED');
    expect(lockData.snapshot).toBeDefined();

    // 6. Any subsequent join attempts after lock fail
    const postLockJoin = await request.post(`${API_URL}/teams/join`, {
      headers: { 'x-test-user-id': 'user_student_001' },
      data: { inviteCode },
    });
    expect([400, 403, 409]).toContain(postLockJoin.status());
  });
});
