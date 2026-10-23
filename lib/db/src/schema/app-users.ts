import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const appUsersTable = pgTable("app_users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  picture: text("picture"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type AppUser = typeof appUsersTable.$inferSelect;
