CREATE TYPE "public"."channel_kind" AS ENUM('ANNOUNCEMENTS', 'GENERAL', 'EVENTS', 'DOUBT');--> statement-breakpoint
CREATE TYPE "public"."club_member_role" AS ENUM('OWNER', 'ADMIN', 'MEMBER');--> statement-breakpoint
CREATE TYPE "public"."event_status" AS ENUM('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'PUBLISHED', 'LIVE', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."notification_channel" AS ENUM('EMAIL', 'WHATSAPP');--> statement-breakpoint
CREATE TYPE "public"."notification_kind" AS ENUM('BOOKING_CONFIRMED', 'REMINDER_24H', 'REMINDER_2H', 'WAITLIST_OFFER', 'FACULTY_APPROVAL', 'STRIKE_NOTICE');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('NOT_REQUIRED', 'PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED');--> statement-breakpoint
CREATE TYPE "public"."proposal_status" AS ENUM('PENDING', 'APPROVED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."question_type" AS ENUM('SHORT_TEXT', 'LONG_TEXT', 'NUMBER', 'EMAIL', 'PHONE', 'SINGLE_SELECT', 'MULTI_SELECT', 'CHECKBOX', 'DATE', 'FILE_UPLOAD');--> statement-breakpoint
CREATE TYPE "public"."registration_status" AS ENUM('CONFIRMED', 'WAITLISTED', 'OFFERED', 'CANCELLED', 'EXPIRED', 'NO_SHOW');--> statement-breakpoint
CREATE TYPE "public"."scan_mode" AS ENUM('GATE', 'MEAL', 'KIT');--> statement-breakpoint
CREATE TYPE "public"."scan_result" AS ENUM('GREEN', 'RED', 'YELLOW');--> statement-breakpoint
CREATE TYPE "public"."team_status" AS ENUM('FORMING', 'LOCKED', 'SUBMITTED', 'DISQUALIFIED');--> statement-breakpoint
CREATE TYPE "public"."ticket_status" AS ENUM('VALID', 'CHECKED_IN', 'VOID');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('STUDENT', 'ORGANIZER', 'FACULTY', 'ADMIN');--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_id" text NOT NULL,
	"email" text NOT NULL,
	"full_name" text NOT NULL,
	"roll_number" text,
	"department" text,
	"year" integer,
	"phone" text,
	"avatar_url" text,
	"role" "user_role" DEFAULT 'STUDENT' NOT NULL,
	"strike_count" integer DEFAULT 0 NOT NULL,
	"consecutive_no_shows" integer DEFAULT 0 NOT NULL,
	"cooldown_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "users_clerk_id_unique" UNIQUE("clerk_id"),
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_roll_number_unique" UNIQUE("roll_number")
);
--> statement-breakpoint
CREATE TABLE "club_members" (
	"club_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "club_member_role" DEFAULT 'MEMBER' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "club_members_club_id_user_id_pk" PRIMARY KEY("club_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "clubs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text NOT NULL,
	"logo_key" text,
	"banner_key" text,
	"faculty_coordinator_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clubs_name_unique" UNIQUE("name"),
	CONSTRAINT "clubs_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "av_resources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "av_resources_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "venues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"capacity" integer NOT NULL,
	"location_text" text NOT NULL,
	"map_url" text,
	CONSTRAINT "venues_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "event_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"proposed_by" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"expected_attendance" integer NOT NULL,
	"venue_id" uuid,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"status" "proposal_status" DEFAULT 'PENDING' NOT NULL,
	"faculty_id" uuid,
	"decided_at" timestamp with time zone,
	"decision_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "proposals_end_after_start" CHECK ("event_proposals"."end_at" > "event_proposals"."start_at")
);
--> statement-breakpoint
CREATE TABLE "magic_link_jti" (
	"jti" text PRIMARY KEY NOT NULL,
	"proposal_id" uuid NOT NULL,
	"action" text NOT NULL,
	"used_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proposal_av_requests" (
	"proposal_id" uuid NOT NULL,
	"av_resource_id" uuid NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "proposal_av_requests_proposal_id_av_resource_id_pk" PRIMARY KEY("proposal_id","av_resource_id")
);
--> statement-breakpoint
CREATE TABLE "event_av_bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"av_resource_id" uuid NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"during" "tstzrange" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"proposal_id" uuid,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"description" text NOT NULL,
	"agenda" jsonb,
	"category" text NOT NULL,
	"poster_key" text,
	"venue_id" uuid,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"registration_opens_at" timestamp with time zone NOT NULL,
	"registration_closes_at" timestamp with time zone NOT NULL,
	"status" "event_status" DEFAULT 'DRAFT' NOT NULL,
	"capacity" integer NOT NULL,
	"remaining_capacity" integer NOT NULL,
	"price_paise" integer DEFAULT 0 NOT NULL,
	"is_paid" boolean DEFAULT false NOT NULL,
	"is_competition" boolean DEFAULT false NOT NULL,
	"min_team_size" integer,
	"max_team_size" integer,
	"form_frozen_at" timestamp with time zone,
	"checkin_closed_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "events_slug_unique" UNIQUE("slug"),
	CONSTRAINT "events_remaining_nonneg" CHECK ("events"."remaining_capacity" >= 0),
	CONSTRAINT "events_remaining_le_capacity" CHECK ("events"."remaining_capacity" <= "events"."capacity"),
	CONSTRAINT "events_end_after_start" CHECK ("events"."end_at" > "events"."start_at"),
	CONSTRAINT "events_competition_team_sizes" CHECK ((NOT "events"."is_competition") OR ("events"."min_team_size" >= 1 AND "events"."max_team_size" >= "events"."min_team_size"))
);
--> statement-breakpoint
CREATE TABLE "venue_bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid,
	"proposal_id" uuid,
	"venue_id" uuid NOT NULL,
	"during" "tstzrange" NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "form_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"type" "question_type" NOT NULL,
	"label" text NOT NULL,
	"help_text" text,
	"required" boolean DEFAULT false NOT NULL,
	"options" jsonb,
	"validation" jsonb,
	"added_after_freeze" boolean DEFAULT false NOT NULL,
	"archived" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"registration_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"question_label_snapshot" text NOT NULL,
	"question_type_snapshot" text NOT NULL,
	"value" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "registrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "registration_status" DEFAULT 'CONFIRMED' NOT NULL,
	"payment_status" "payment_status" DEFAULT 'NOT_REQUIRED' NOT NULL,
	"amount_paise" integer DEFAULT 0 NOT NULL,
	"waitlist_position_hint" integer,
	"offer_expires_at" timestamp with time zone,
	"offered_at" timestamp with time zone,
	"team_id" uuid,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "waitlist_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"registration_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"promoted_at" timestamp with time zone,
	"status" text DEFAULT 'QUEUED' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"amount_paise" integer NOT NULL,
	"balance_after_paise" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"registration_id" uuid NOT NULL,
	"provider" text DEFAULT 'SANDBOX' NOT NULL,
	"provider_ref" text NOT NULL,
	"amount_paise" integer NOT NULL,
	"status" "payment_status" DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"settled_at" timestamp with time zone,
	CONSTRAINT "payments_provider_ref_unique" UNIQUE("provider_ref")
);
--> statement-breakpoint
CREATE TABLE "scan_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"token_prefix_hash" text NOT NULL,
	"mode" "scan_mode" NOT NULL,
	"result" "scan_result" NOT NULL,
	"scanner_user_id" uuid,
	"passkey_id" uuid,
	"ticket_id" uuid,
	"scanned_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scanner_passkeys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"passkey_hash" text NOT NULL,
	"label" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scanner_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"passkey_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_redemptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"kind" "scan_mode" NOT NULL,
	"redeemed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"redeemed_by" uuid
);
--> statement-breakpoint
CREATE TABLE "tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"registration_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"token" char(32) NOT NULL,
	"status" "ticket_status" DEFAULT 'VALID' NOT NULL,
	"checked_in_at" timestamp with time zone,
	"checked_in_by" uuid,
	"checked_in_via" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tickets_registration_id_unique" UNIQUE("registration_id"),
	CONSTRAINT "tickets_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"event_id" uuid,
	"kind" "notification_kind" NOT NULL,
	"channel" "notification_channel" NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'QUEUED' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "channel_reads" (
	"channel_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"last_read_message_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "channel_reads_channel_id_user_id_pk" PRIMARY KEY("channel_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "club_channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid,
	"event_id" uuid,
	"kind" "channel_kind" DEFAULT 'GENERAL' NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	CONSTRAINT "club_channels_exactly_one_parent" CHECK (("club_channels"."club_id" IS NOT NULL AND "club_channels"."event_id" IS NULL) OR ("club_channels"."club_id" IS NULL AND "club_channels"."event_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"body" text NOT NULL,
	"reply_to_id" uuid,
	"pinned_at" timestamp with time zone,
	"author_role_badge" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_members" (
	"team_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"role" text DEFAULT 'MEMBER' NOT NULL,
	CONSTRAINT "team_members_team_id_user_id_pk" PRIMARY KEY("team_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "team_roster_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teammate_pool" (
	"event_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"skills" text[],
	"bio" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "teammate_pool_event_id_user_id_pk" PRIMARY KEY("event_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"name" text NOT NULL,
	"leader_id" uuid NOT NULL,
	"invite_code" char(6) NOT NULL,
	"status" "team_status" DEFAULT 'FORMING' NOT NULL,
	"locked_at" timestamp with time zone,
	"project_title" text,
	"project_abstract" text,
	"repo_url" text,
	"demo_url" text,
	"deck_key" text,
	"submitted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "certificates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"rank" smallint,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"og_image_key" text
);
--> statement-breakpoint
CREATE TABLE "od_letters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"serial" text NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"signature" text NOT NULL,
	"pdf_key" text,
	CONSTRAINT "od_letters_serial_unique" UNIQUE("serial")
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"stars" smallint NOT NULL,
	"comment" text NOT NULL,
	"verified" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reviews_stars_check" CHECK ("reviews"."stars" >= 1 AND "reviews"."stars" <= 5)
);
--> statement-breakpoint
CREATE TABLE "winners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"team_id" uuid,
	"rank" smallint NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "winners_rank_check" CHECK ("winners"."rank" IN (1, 2, 3))
);
--> statement-breakpoint
CREATE TABLE "budget_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"event_id" uuid,
	"allocated_paise" integer NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expense_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"allocation_id" uuid NOT NULL,
	"category" text NOT NULL,
	"description" text NOT NULL,
	"amount_paise" integer NOT NULL,
	"receipt_key" text NOT NULL,
	"signed_off_by" uuid,
	"signed_off_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text NOT NULL,
	"diff" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "club_members" ADD CONSTRAINT "club_members_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_members" ADD CONSTRAINT "club_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clubs" ADD CONSTRAINT "clubs_faculty_coordinator_id_users_id_fk" FOREIGN KEY ("faculty_coordinator_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clubs" ADD CONSTRAINT "clubs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_proposals" ADD CONSTRAINT "event_proposals_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_proposals" ADD CONSTRAINT "event_proposals_proposed_by_users_id_fk" FOREIGN KEY ("proposed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_proposals" ADD CONSTRAINT "event_proposals_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_proposals" ADD CONSTRAINT "event_proposals_faculty_id_users_id_fk" FOREIGN KEY ("faculty_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "magic_link_jti" ADD CONSTRAINT "magic_link_jti_proposal_id_event_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."event_proposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_av_requests" ADD CONSTRAINT "proposal_av_requests_proposal_id_event_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."event_proposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_av_requests" ADD CONSTRAINT "proposal_av_requests_av_resource_id_av_resources_id_fk" FOREIGN KEY ("av_resource_id") REFERENCES "public"."av_resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_av_bookings" ADD CONSTRAINT "event_av_bookings_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_av_bookings" ADD CONSTRAINT "event_av_bookings_av_resource_id_av_resources_id_fk" FOREIGN KEY ("av_resource_id") REFERENCES "public"."av_resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_proposal_id_event_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."event_proposals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venue_bookings" ADD CONSTRAINT "venue_bookings_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venue_bookings" ADD CONSTRAINT "venue_bookings_proposal_id_event_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."event_proposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venue_bookings" ADD CONSTRAINT "venue_bookings_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_questions" ADD CONSTRAINT "form_questions_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_answers" ADD CONSTRAINT "booking_answers_registration_id_registrations_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."registrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_answers" ADD CONSTRAINT "booking_answers_question_id_form_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."form_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_registration_id_registrations_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."registrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_registration_id_registrations_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."registrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan_logs" ADD CONSTRAINT "scan_logs_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan_logs" ADD CONSTRAINT "scan_logs_scanner_user_id_users_id_fk" FOREIGN KEY ("scanner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan_logs" ADD CONSTRAINT "scan_logs_passkey_id_scanner_passkeys_id_fk" FOREIGN KEY ("passkey_id") REFERENCES "public"."scanner_passkeys"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan_logs" ADD CONSTRAINT "scan_logs_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scanner_passkeys" ADD CONSTRAINT "scanner_passkeys_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scanner_passkeys" ADD CONSTRAINT "scanner_passkeys_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scanner_sessions" ADD CONSTRAINT "scanner_sessions_passkey_id_scanner_passkeys_id_fk" FOREIGN KEY ("passkey_id") REFERENCES "public"."scanner_passkeys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scanner_sessions" ADD CONSTRAINT "scanner_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_redemptions" ADD CONSTRAINT "ticket_redemptions_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_redemptions" ADD CONSTRAINT "ticket_redemptions_redeemed_by_users_id_fk" FOREIGN KEY ("redeemed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_registration_id_registrations_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."registrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_checked_in_by_users_id_fk" FOREIGN KEY ("checked_in_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_reads" ADD CONSTRAINT "channel_reads_channel_id_club_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."club_channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_reads" ADD CONSTRAINT "channel_reads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_reads" ADD CONSTRAINT "channel_reads_last_read_message_id_messages_id_fk" FOREIGN KEY ("last_read_message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_channels" ADD CONSTRAINT "club_channels_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_channels" ADD CONSTRAINT "club_channels_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_channel_id_club_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."club_channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_roster_snapshots" ADD CONSTRAINT "team_roster_snapshots_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teammate_pool" ADD CONSTRAINT "teammate_pool_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teammate_pool" ADD CONSTRAINT "teammate_pool_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_leader_id_users_id_fk" FOREIGN KEY ("leader_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "od_letters" ADD CONSTRAINT "od_letters_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "od_letters" ADD CONSTRAINT "od_letters_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "winners" ADD CONSTRAINT "winners_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "winners" ADD CONSTRAINT "winners_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_allocations" ADD CONSTRAINT "budget_allocations_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_allocations" ADD CONSTRAINT "budget_allocations_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_items" ADD CONSTRAINT "expense_items_allocation_id_budget_allocations_id_fk" FOREIGN KEY ("allocation_id") REFERENCES "public"."budget_allocations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_items" ADD CONSTRAINT "expense_items_signed_off_by_users_id_fk" FOREIGN KEY ("signed_off_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "events_status_start_at_idx" ON "events" USING btree ("status","start_at");--> statement-breakpoint
CREATE INDEX "events_club_id_idx" ON "events" USING btree ("club_id");--> statement-breakpoint
CREATE UNIQUE INDEX "form_questions_event_position_idx" ON "form_questions" USING btree ("event_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "booking_answers_reg_question_idx" ON "booking_answers" USING btree ("registration_id","question_id");--> statement-breakpoint
CREATE INDEX "registrations_event_status_created_idx" ON "registrations" USING btree ("event_id","status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "registrations_event_user_active_idx" ON "registrations" USING btree ("event_id","user_id") WHERE status NOT IN ('CANCELLED', 'EXPIRED');--> statement-breakpoint
CREATE INDEX "waitlist_entries_event_status_created_id_idx" ON "waitlist_entries" USING btree ("event_id","status","created_at","id");--> statement-breakpoint
CREATE INDEX "scan_logs_event_scanned_at_idx" ON "scan_logs" USING btree ("event_id","scanned_at");--> statement-breakpoint
CREATE UNIQUE INDEX "scanner_passkeys_event_hash_idx" ON "scanner_passkeys" USING btree ("event_id","passkey_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "ticket_redemptions_ticket_kind_idx" ON "ticket_redemptions" USING btree ("ticket_id","kind");--> statement-breakpoint
CREATE INDEX "tickets_event_status_idx" ON "tickets" USING btree ("event_id","status");--> statement-breakpoint
CREATE INDEX "notifications_status_run_at_idx" ON "notifications" USING btree ("status","run_at");--> statement-breakpoint
CREATE UNIQUE INDEX "club_channels_club_slug_idx" ON "club_channels" USING btree ("club_id","slug");--> statement-breakpoint
CREATE INDEX "messages_channel_created_desc_idx" ON "messages" USING btree ("channel_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "team_members_event_user_idx" ON "team_members" USING btree ("event_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "teams_event_invite_code_idx" ON "teams" USING btree ("event_id","invite_code");--> statement-breakpoint
CREATE UNIQUE INDEX "teams_event_name_idx" ON "teams" USING btree ("event_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "reviews_event_user_idx" ON "reviews" USING btree ("event_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "winners_event_rank_idx" ON "winners" USING btree ("event_id","rank");