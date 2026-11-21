ALTER TABLE "uploaded_files" ADD COLUMN "tenant_id" integer;--> statement-breakpoint
ALTER TABLE "uploaded_files" ADD CONSTRAINT "uploaded_files_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "uploaded_files_tenant_idx" ON "uploaded_files" USING btree ("tenant_id");