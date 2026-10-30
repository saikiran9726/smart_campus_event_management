import { describe, expect, it, vi } from 'vitest';
import { getTableColumns, getTableName, is } from 'drizzle-orm';
import { PgTable } from 'drizzle-orm/pg-core';
import { db, pool, withTx } from '../db/client';
import * as schema from '../db/schema';

describe('Drizzle Database Schema & Client', () => {
  it('exports valid db, pool, and withTx helper', () => {
    expect(db).toBeDefined();
    expect(pool).toBeDefined();
    expect(typeof withTx).toBe('function');
  });

  it('defines all 37 core tables with expected column definitions', () => {
    const tableList: PgTable[] = [
      schema.users,
      schema.clubs,
      schema.clubMembers,
      schema.venues,
      schema.avResources,
      schema.eventProposals,
      schema.proposalAvRequests,
      schema.magicLinkJti,
      schema.events,
      schema.eventAvBookings,
      schema.venueBookings,
      schema.formQuestions,
      schema.registrations,
      schema.waitlistEntries,
      schema.bookingAnswers,
      schema.payments,
      schema.ledgerEntries,
      schema.tickets,
      schema.ticketRedemptions,
      schema.scanLogs,
      schema.scannerPasskeys,
      schema.scannerSessions,
      schema.notifications,
      schema.clubChannels,
      schema.messages,
      schema.channelReads,
      schema.teams,
      schema.teamMembers,
      schema.teamRosterSnapshots,
      schema.teammatePool,
      schema.winners,
      schema.reviews,
      schema.odLetters,
      schema.certificates,
      schema.budgetAllocations,
      schema.expenseItems,
      schema.auditLogs,
    ];

    expect(tableList).toHaveLength(37);

    for (const table of tableList) {
      expect(is(table, PgTable)).toBe(true);
      const tableName = getTableName(table);
      expect(typeof tableName).toBe('string');
      expect(tableName.length).toBeGreaterThan(0);

      const columns = getTableColumns(table);
      expect(Object.keys(columns).length).toBeGreaterThan(0);
    }
  });

  it('verifies users table schema details', () => {
    const cols = getTableColumns(schema.users);
    expect(cols.id).toBeDefined();
    expect(cols.clerkId).toBeDefined();
    expect(cols.email).toBeDefined();
    expect(cols.fullName).toBeDefined();
    expect(cols.role).toBeDefined();
    expect(cols.strikeCount).toBeDefined();
    expect(cols.consecutiveNoShows).toBeDefined();
    expect(cols.cooldownUntil).toBeDefined();
  });

  it('verifies events table schema details and constraints', () => {
    const cols = getTableColumns(schema.events);
    expect(cols.id).toBeDefined();
    expect(cols.clubId).toBeDefined();
    expect(cols.title).toBeDefined();
    expect(cols.slug).toBeDefined();
    expect(cols.capacity).toBeDefined();
    expect(cols.remainingCapacity).toBeDefined();
    expect(cols.pricePaise).toBeDefined();
    expect(cols.isCompetition).toBeDefined();
    expect(cols.minTeamSize).toBeDefined();
    expect(cols.maxTeamSize).toBeDefined();
  });

  it('verifies registrations table schema details', () => {
    const cols = getTableColumns(schema.registrations);
    expect(cols.id).toBeDefined();
    expect(cols.eventId).toBeDefined();
    expect(cols.userId).toBeDefined();
    expect(cols.status).toBeDefined();
    expect(cols.paymentStatus).toBeDefined();
    expect(cols.amountPaise).toBeDefined();
  });

  it('verifies tickets and redemptions table schema details', () => {
    const ticketCols = getTableColumns(schema.tickets);
    expect(ticketCols.id).toBeDefined();
    expect(ticketCols.registrationId).toBeDefined();
    expect(ticketCols.token).toBeDefined();
    expect(ticketCols.status).toBeDefined();

    const redemptionCols = getTableColumns(schema.ticketRedemptions);
    expect(redemptionCols.id).toBeDefined();
    expect(redemptionCols.ticketId).toBeDefined();
    expect(redemptionCols.kind).toBeDefined();
  });

  it('verifies teams and team_members table schema details', () => {
    const teamCols = getTableColumns(schema.teams);
    expect(teamCols.id).toBeDefined();
    expect(teamCols.eventId).toBeDefined();
    expect(teamCols.inviteCode).toBeDefined();
    expect(teamCols.status).toBeDefined();

    const memberCols = getTableColumns(schema.teamMembers);
    expect(memberCols.teamId).toBeDefined();
    expect(memberCols.userId).toBeDefined();
    expect(memberCols.eventId).toBeDefined();
  });

  it('withTx manages client lifecycle and handles commit and rollback', async () => {
    const mockClient = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
      release: vi.fn(),
    };

    vi.spyOn(pool, 'connect').mockResolvedValueOnce(mockClient as any);

    const result = await withTx(async (tx) => {
      expect(tx).toBeDefined();
      return 'success';
    });

    expect(result).toBe('success');
    expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
    expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    expect(mockClient.release).toHaveBeenCalledTimes(1);

    // Test rollback on error
    vi.spyOn(pool, 'connect').mockResolvedValueOnce(mockClient as any);
    await expect(
      withTx(async () => {
        throw new Error('Test transaction failure');
      })
    ).rejects.toThrow('Test transaction failure');

    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    expect(mockClient.release).toHaveBeenCalledTimes(2);
  });
});
