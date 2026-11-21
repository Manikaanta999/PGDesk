CREATE TYPE "public"."account_link_status" AS ENUM('NO_ACCOUNT', 'ACCOUNT_CREATED', 'LINK_PENDING', 'LINKED', 'LINK_REJECTED');--> statement-breakpoint
CREATE TYPE "public"."bed_status" AS ENUM('VACANT', 'OCCUPIED', 'RESERVED', 'MAINTENANCE');--> statement-breakpoint
CREATE TYPE "public"."billing_mode" AS ENUM('FIXED_1ST', 'JOIN_DATE');--> statement-breakpoint
CREATE TYPE "public"."complaint_category" AS ENUM('PLUMBING', 'ELECTRICAL', 'WIFI', 'HOUSEKEEPING', 'FOOD', 'SECURITY', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."complaint_priority" AS ENUM('LOW', 'MEDIUM', 'HIGH', 'URGENT');--> statement-breakpoint
CREATE TYPE "public"."complaint_status" AS ENUM('OPEN', 'IN_PROGRESS', 'RESOLVED');--> statement-breakpoint
CREATE TYPE "public"."deposit_status" AS ENUM('HELD', 'PARTIAL_REFUND', 'REFUNDED', 'FORFEITED');--> statement-breakpoint
CREATE TYPE "public"."enquiry_status" AS ENUM('NEW_ENQUIRY', 'CONTACTED', 'APPROVED', 'REJECTED', 'CONVERTED_TO_STUDENT');--> statement-breakpoint
CREATE TYPE "public"."expense_category" AS ENUM('ELECTRICITY', 'WATER', 'MAINTENANCE', 'STAFF_SALARY', 'FOOD_KITCHEN', 'INTERNET', 'HOUSEKEEPING', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."gender_type" AS ENUM('BOYS', 'GIRLS', 'COED');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('PAID', 'PENDING', 'UNPAID', 'OVERDUE', 'PARTIAL');--> statement-breakpoint
CREATE TYPE "public"."payment_approval_status" AS ENUM('APPROVED', 'PENDING_APPROVAL', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('CASH', 'UPI', 'BANK', 'ONLINE');--> statement-breakpoint
CREATE TYPE "public"."room_type" AS ENUM('SINGLE', 'DOUBLE', 'TRIPLE', 'DORM');--> statement-breakpoint
CREATE TYPE "public"."tenant_status" AS ENUM('ACTIVE', 'NOTICE', 'LEFT');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('ADMIN', 'OWNER', 'MANAGER', 'TENANT');--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"actor_user_id" integer,
	"actor_name" text NOT NULL,
	"actor_role" text NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "beds" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"property_id" integer NOT NULL,
	"floor_id" integer NOT NULL,
	"room_id" integer NOT NULL,
	"bed_label" text NOT NULL,
	"status" "bed_status" DEFAULT 'VACANT' NOT NULL,
	"monthly_rent_override" integer,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "complaint_comments" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"complaint_id" integer NOT NULL,
	"author_user_id" integer,
	"author_name" text NOT NULL,
	"author_role" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "complaints" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"property_id" integer NOT NULL,
	"tenant_id" integer NOT NULL,
	"title" text NOT NULL,
	"category" "complaint_category" DEFAULT 'OTHER' NOT NULL,
	"description" text NOT NULL,
	"photo_url" text,
	"priority" "complaint_priority" DEFAULT 'MEDIUM' NOT NULL,
	"status" "complaint_status" DEFAULT 'OPEN' NOT NULL,
	"assigned_to_user_id" integer,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enquiries" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"property_id" integer NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"email" text,
	"preferred_room_type" text DEFAULT 'DOUBLE' NOT NULL,
	"move_in_date" text,
	"message" text DEFAULT '' NOT NULL,
	"status" "enquiry_status" DEFAULT 'NEW_ENQUIRY' NOT NULL,
	"source" text DEFAULT 'PUBLIC_LISTING' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"property_id" integer NOT NULL,
	"category" "expense_category" NOT NULL,
	"amount" integer NOT NULL,
	"expense_date" text NOT NULL,
	"vendor" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"recorded_by_user_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "floors" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"property_id" integer NOT NULL,
	"name" text NOT NULL,
	"floor_number" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"property_id" integer NOT NULL,
	"tenant_id" integer NOT NULL,
	"invoice_number" text NOT NULL,
	"period_month" integer NOT NULL,
	"period_year" integer NOT NULL,
	"period_start" text NOT NULL,
	"period_end" text NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"amount" integer NOT NULL,
	"paid_amount" integer DEFAULT 0 NOT NULL,
	"due_date" text NOT NULL,
	"status" "invoice_status" DEFAULT 'UNPAID' NOT NULL,
	"is_pro_rata" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "move_out_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"property_id" integer NOT NULL,
	"tenant_id" integer NOT NULL,
	"requested_leave_date" text NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'SUBMITTED' NOT NULL,
	"owner_note" text DEFAULT '' NOT NULL,
	"reviewed_by_user_id" integer,
	"reviewed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notices" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"property_id" integer,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"created_by_user_id" integer,
	"created_by_name" text DEFAULT 'Management' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"brand_color" text DEFAULT '#0F766E' NOT NULL,
	"logo_url" text,
	"upi_id" text DEFAULT 'pgdesk@okicici' NOT NULL,
	"upi_payee_name" text DEFAULT 'PGDesk Residences' NOT NULL,
	"gstin" text DEFAULT '' NOT NULL,
	"gst_rate_pct" integer DEFAULT 0 NOT NULL,
	"plan_tier" text DEFAULT 'GROWTH' NOT NULL,
	"invoice_seq" integer DEFAULT 1 NOT NULL,
	"billing_day_default" integer DEFAULT 1 NOT NULL,
	"due_days_after_invoice" integer DEFAULT 5 NOT NULL,
	"late_fee_per_day" integer DEFAULT 100 NOT NULL,
	"grace_days" integer DEFAULT 3 NOT NULL,
	"notice_period_days" integer DEFAULT 30 NOT NULL,
	"phone" text DEFAULT '+91 98450 11223' NOT NULL,
	"email" text DEFAULT 'ops@pgdesk.in' NOT NULL,
	"address" text DEFAULT 'Bengaluru, Karnataka' NOT NULL,
	"bank_details" text DEFAULT '' NOT NULL,
	"payment_instructions" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"invoice_id" integer NOT NULL,
	"tenant_id" integer NOT NULL,
	"amount" integer NOT NULL,
	"method" "payment_method" DEFAULT 'UPI' NOT NULL,
	"reference" text DEFAULT '' NOT NULL,
	"screenshot_url" text,
	"approval_status" "payment_approval_status" DEFAULT 'APPROVED' NOT NULL,
	"paid_at" text NOT NULL,
	"recorded_by_user_id" integer,
	"idempotency_key" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "properties" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"address" text NOT NULL,
	"locality" text DEFAULT 'Koramangala' NOT NULL,
	"city" text NOT NULL,
	"gender_type" "gender_type" DEFAULT 'BOYS' NOT NULL,
	"amenities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"photos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"rules" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"contact_name" text DEFAULT 'Property Manager' NOT NULL,
	"contact_phone" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"is_public" boolean DEFAULT true NOT NULL,
	"billing_mode" "billing_mode" DEFAULT 'FIXED_1ST' NOT NULL,
	"billing_day" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rooms" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"property_id" integer NOT NULL,
	"floor_id" integer NOT NULL,
	"room_number" text NOT NULL,
	"room_type" "room_type" DEFAULT 'DOUBLE' NOT NULL,
	"is_ac" boolean DEFAULT false NOT NULL,
	"attached_bath" boolean DEFAULT true NOT NULL,
	"rent_per_bed" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"property_id" integer NOT NULL,
	"bed_id" integer,
	"user_id" integer,
	"account_link_status" "account_link_status" DEFAULT 'NO_ACCOUNT' NOT NULL,
	"link_code_hash" text,
	"link_code_expires_at" timestamp,
	"link_requested_by_user_id" integer,
	"link_requested_at" timestamp,
	"linked_at" timestamp,
	"name" text NOT NULL,
	"phone" text,
	"email" text,
	"photo_url" text,
	"date_of_birth" text,
	"id_type" text DEFAULT 'Aadhaar' NOT NULL,
	"id_number_masked" text DEFAULT '' NOT NULL,
	"id_document_url" text,
	"kyc_verified_status" text DEFAULT 'PENDING' NOT NULL,
	"occupation" text DEFAULT 'Software Engineer' NOT NULL,
	"company_or_college" text DEFAULT '' NOT NULL,
	"permanent_address" text DEFAULT '' NOT NULL,
	"emergency_contact_name" text DEFAULT '' NOT NULL,
	"emergency_contact_relation" text DEFAULT '' NOT NULL,
	"emergency_contact_phone" text DEFAULT '' NOT NULL,
	"join_date" text NOT NULL,
	"leave_date" text,
	"notice_requested_at" text,
	"status" "tenant_status" DEFAULT 'ACTIVE' NOT NULL,
	"monthly_rent" integer NOT NULL,
	"security_deposit" integer DEFAULT 0 NOT NULL,
	"deposit_status" "deposit_status" DEFAULT 'HELD' NOT NULL,
	"deposit_deductions" integer DEFAULT 0 NOT NULL,
	"deposit_settlement_note" text,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "uploaded_files" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"owner_user_id" integer,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"storage_key" text NOT NULL,
	"provider" text DEFAULT 'local_db' NOT NULL,
	"external_url" text,
	"content_base64" text,
	"is_private" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"session_id" text NOT NULL,
	"user_agent" text DEFAULT 'Web Browser' NOT NULL,
	"ip_address" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	"revoked_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"uid" text,
	"organization_id" integer NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"photo_url" text,
	"password_hash" text,
	"role" "user_role" DEFAULT 'OWNER' NOT NULL,
	"assigned_property_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"email_verified" boolean DEFAULT true NOT NULL,
	"phone_verified" boolean DEFAULT false NOT NULL,
	"email_verification_token_hash" text,
	"email_verification_expires_at" timestamp,
	"token_version" integer DEFAULT 1 NOT NULL,
	"last_login_at" timestamp,
	"notification_prefs" jsonb DEFAULT '{"hostelNotices":true,"rentReminders":true,"complaintUpdates":true,"securityAlerts":true}'::jsonb NOT NULL,
	"pending_email" text,
	"pending_email_code_hash" text,
	"pending_email_expires_at" timestamp,
	"pending_phone" text,
	"pending_phone_code_hash" text,
	"pending_phone_expires_at" timestamp,
	"otp_code_hash" text,
	"otp_expires_at" timestamp,
	"reset_token_hash" text,
	"reset_token_expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_uid_unique" UNIQUE("uid")
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "beds" ADD CONSTRAINT "beds_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "beds" ADD CONSTRAINT "beds_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "beds" ADD CONSTRAINT "beds_floor_id_floors_id_fk" FOREIGN KEY ("floor_id") REFERENCES "public"."floors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "beds" ADD CONSTRAINT "beds_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaint_comments" ADD CONSTRAINT "complaint_comments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaint_comments" ADD CONSTRAINT "complaint_comments_complaint_id_complaints_id_fk" FOREIGN KEY ("complaint_id") REFERENCES "public"."complaints"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaint_comments" ADD CONSTRAINT "complaint_comments_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_assigned_to_user_id_users_id_fk" FOREIGN KEY ("assigned_to_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "floors" ADD CONSTRAINT "floors_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "floors" ADD CONSTRAINT "floors_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "move_out_requests" ADD CONSTRAINT "move_out_requests_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "move_out_requests" ADD CONSTRAINT "move_out_requests_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "move_out_requests" ADD CONSTRAINT "move_out_requests_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "move_out_requests" ADD CONSTRAINT "move_out_requests_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notices" ADD CONSTRAINT "notices_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notices" ADD CONSTRAINT "notices_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notices" ADD CONSTRAINT "notices_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_floor_id_floors_id_fk" FOREIGN KEY ("floor_id") REFERENCES "public"."floors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_bed_id_beds_id_fk" FOREIGN KEY ("bed_id") REFERENCES "public"."beds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_link_requested_by_user_id_users_id_fk" FOREIGN KEY ("link_requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploaded_files" ADD CONSTRAINT "uploaded_files_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploaded_files" ADD CONSTRAINT "uploaded_files_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_logs_org_idx" ON "audit_logs" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "audit_logs_created_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "beds_org_idx" ON "beds" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "beds_property_idx" ON "beds" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "beds_room_idx" ON "beds" USING btree ("room_id");--> statement-breakpoint
CREATE INDEX "beds_status_idx" ON "beds" USING btree ("status");--> statement-breakpoint
CREATE INDEX "complaint_comments_complaint_idx" ON "complaint_comments" USING btree ("complaint_id");--> statement-breakpoint
CREATE INDEX "complaint_comments_org_idx" ON "complaint_comments" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "complaints_org_idx" ON "complaints" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "complaints_property_idx" ON "complaints" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "complaints_tenant_idx" ON "complaints" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "complaints_status_idx" ON "complaints" USING btree ("status");--> statement-breakpoint
CREATE INDEX "enquiries_org_idx" ON "enquiries" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "enquiries_property_idx" ON "enquiries" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "enquiries_status_idx" ON "enquiries" USING btree ("status");--> statement-breakpoint
CREATE INDEX "expenses_org_idx" ON "expenses" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "expenses_property_idx" ON "expenses" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "expenses_date_idx" ON "expenses" USING btree ("expense_date");--> statement-breakpoint
CREATE INDEX "floors_org_idx" ON "floors" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "floors_property_idx" ON "floors" USING btree ("property_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_number_idx" ON "invoices" USING btree ("organization_id","invoice_number");--> statement-breakpoint
CREATE INDEX "invoices_org_idx" ON "invoices" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "invoices_tenant_idx" ON "invoices" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "invoices_property_idx" ON "invoices" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "invoices_status_idx" ON "invoices" USING btree ("status");--> statement-breakpoint
CREATE INDEX "invoices_period_idx" ON "invoices" USING btree ("period_year","period_month");--> statement-breakpoint
CREATE INDEX "move_out_requests_org_idx" ON "move_out_requests" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "move_out_requests_tenant_idx" ON "move_out_requests" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "move_out_requests_status_idx" ON "move_out_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "notices_org_idx" ON "notices" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "notices_property_idx" ON "notices" USING btree ("property_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_slug_idx" ON "organizations" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "payments_org_idx" ON "payments" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "payments_invoice_idx" ON "payments" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "payments_tenant_idx" ON "payments" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "payments_approval_idx" ON "payments" USING btree ("approval_status");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_org_idempotency_idx" ON "payments" USING btree ("organization_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "properties_slug_idx" ON "properties" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "properties_org_idx" ON "properties" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "rooms_org_idx" ON "rooms" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "rooms_property_idx" ON "rooms" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "rooms_floor_idx" ON "rooms" USING btree ("floor_id");--> statement-breakpoint
CREATE INDEX "tenants_org_idx" ON "tenants" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "tenants_property_idx" ON "tenants" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "tenants_bed_idx" ON "tenants" USING btree ("bed_id");--> statement-breakpoint
CREATE INDEX "tenants_status_idx" ON "tenants" USING btree ("status");--> statement-breakpoint
CREATE INDEX "tenants_user_idx" ON "tenants" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "tenants_link_status_idx" ON "tenants" USING btree ("account_link_status");--> statement-breakpoint
CREATE INDEX "uploaded_files_org_idx" ON "uploaded_files" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "user_sessions_user_idx" ON "user_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_sessions_sid_idx" ON "user_sessions" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "users_org_idx" ON "users" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_phone_idx" ON "users" USING btree ("phone");