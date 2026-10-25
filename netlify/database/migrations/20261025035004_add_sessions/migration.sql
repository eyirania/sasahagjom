CREATE TABLE "sessions" (
	"id" text PRIMARY KEY,
	"sub" text NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now()
);
