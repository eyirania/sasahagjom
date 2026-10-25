import {
  pgTable,
  serial,
  text,
  integer,
  numeric,
  boolean,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core'

export const subjects = pgTable('subjects', {
  id: serial().primaryKey(),
  name: text().notNull(),
  category: text().notNull(),
  credits: integer().notNull(),
  gradingType: text('grading_type').notNull().default('letter'), // 'letter' | 'pass_fail'
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow(),
})

export const assessmentItems = pgTable('assessment_items', {
  id: serial().primaryKey(),
  subjectId: integer('subject_id')
    .notNull()
    .references(() => subjects.id, { onDelete: 'cascade' }),
  name: text().notNull(),
  points: numeric({ precision: 6, scale: 2 }),
  weight: numeric({ precision: 5, scale: 4 }).notNull().default('1'),
  repeatCount: integer('repeat_count').notNull().default(1),
  kind: text().notNull().default('written'), // 'written' (지필) | 'performance' (수행)
  examSlot: text('exam_slot'), // 'midterm' | 'final' | null
  needsConfirmation: boolean('needs_confirmation').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow(),
})

export const students = pgTable('students', {
  id: serial().primaryKey(),
  identityUserId: text('identity_user_id').unique(),
  email: text().notNull().unique(),
  name: text().notNull(),
  studentNumber: text('student_number'),
  createdAt: timestamp('created_at').defaultNow(),
})

export const studentScores = pgTable(
  'student_scores',
  {
    id: serial().primaryKey(),
    studentId: integer('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    assessmentItemId: integer('assessment_item_id')
      .notNull()
      .references(() => assessmentItems.id, { onDelete: 'cascade' }),
    score: numeric({ precision: 6, scale: 2 }),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (t) => [unique().on(t.studentId, t.assessmentItemId)],
)

export const studentSubjectResults = pgTable(
  'student_subject_results',
  {
    id: serial().primaryKey(),
    studentId: integer('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    subjectId: integer('subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'cascade' }),
    result: text().notNull(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => [unique().on(table.studentId, table.subjectId)],
)

// 로그인 세션. id는 쿠키에 담긴 토큰의 SHA-256 해시이며 토큰 원문은 저장하지 않는다.
export const sessions = pgTable('sessions', {
  id: text().primaryKey(),
  sub: text().notNull(),
  email: text().notNull(),
  name: text().notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
})
