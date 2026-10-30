import { eq } from 'drizzle-orm';
import { generateOpaqueToken, TicketStatus } from '@eventora/shared';
import { Registration, Ticket, tickets } from '../../db/schema';

/**
 * Interface definition for ticket issuance across registration and payment flows.
 */
export async function issueTicket(
  tx: any,
  registration: Registration
): Promise<Ticket> {
  const [existing] = await tx
    .select()
    .from(tickets)
    .where(eq(tickets.registrationId, registration.id))
    .limit(1);

  if (existing) {
    return existing;
  }

  const token = generateOpaqueToken();

  const [ticket] = await tx
    .insert(tickets)
    .values({
      registrationId: registration.id,
      eventId: registration.eventId,
      userId: registration.userId,
      token,
      status: TicketStatus.VALID,
    })
    .returning();

  return ticket!;
}
