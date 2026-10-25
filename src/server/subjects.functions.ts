import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { eq, asc } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { subjects, assessmentItems } from '../../db/schema.js'
import { requireAdminMiddleware } from '../middleware/identity'

export const getSubjectsWithItems = createServerFn({ method: 'GET' }).handler(async () => {
  const allSubjects = await db.select().from(subjects).orderBy(asc(subjects.sortOrder))
  const allItems = await db
    .select()
    .from(assessmentItems)
    .orderBy(asc(assessmentItems.sortOrder))

  return allSubjects.map((subject) => ({
    ...subject,
    items: allItems.filter((item) => item.subjectId === subject.id),
  }))
})

const ItemInput = z.object({
  id: z.number().optional(),
  subjectId: z.number(),
  name: z.string(),
  points: z.number().min(0).max(9999.99).nullable(),
  weight: z.number().positive().max(1),
  repeatCount: z.number().int().min(1),
  kind: z.enum(['written', 'performance']),
  examSlot: z.enum(['midterm', 'final']).nullable(),
  needsConfirmation: z.boolean(),
}).refine((item) => item.needsConfirmation || (item.name.trim().length > 0 && item.points !== null), {
  message: '확정 항목에는 이름과 만점이 필요합니다.',
})

export const upsertAssessmentItem = createServerFn({ method: 'POST' })
  .middleware([requireAdminMiddleware])
  .inputValidator(ItemInput)
  .handler(async ({ data }) => {
    if (data.id) {
      const [updated] = await db
        .update(assessmentItems)
        .set({
          name: data.name,
          points: data.points === null ? null : String(data.points),
          weight: String(data.weight),
          repeatCount: data.repeatCount,
          kind: data.kind,
          examSlot: data.examSlot,
          needsConfirmation: data.needsConfirmation,
        })
        .where(eq(assessmentItems.id, data.id))
        .returning()
      return updated
    }
    const [created] = await db
      .insert(assessmentItems)
      .values({
        subjectId: data.subjectId,
        name: data.name,
        points: data.points === null ? null : String(data.points),
        weight: String(data.weight),
        repeatCount: data.repeatCount,
        kind: data.kind,
        examSlot: data.examSlot,
        needsConfirmation: data.needsConfirmation,
        sortOrder: 99,
      })
      .returning()
    return created
  })

export const deleteAssessmentItem = createServerFn({ method: 'POST' })
  .middleware([requireAdminMiddleware])
  .inputValidator(z.object({ id: z.number() }))
  .handler(async ({ data }) => {
    await db.delete(assessmentItems).where(eq(assessmentItems.id, data.id))
    return { success: true }
  })
