import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { eq, and, asc } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { students, studentScores, studentSubjectResults, assessmentItems, subjects } from '../../db/schema.js'
import { requireAuthMiddleware, requireAdminMiddleware } from '../middleware/identity'
import { maximumScore, weightedMaximum, weightedScore, predictGrade, gradeForScore, averageGpa } from '../lib/grading'

async function getOrCreateStudent(user: { id: string; email: string; name?: string }) {
  const existing = await db
    .select()
    .from(students)
    .where(eq(students.identityUserId, user.id))
    .limit(1)
  if (existing[0]) return existing[0]

  const [created] = await db
    .insert(students)
    .values({
      identityUserId: user.id,
      email: user.email,
      name: user.name || user.email,
    })
    .returning()
  return created
}

export const getMyGrades = createServerFn({ method: 'GET' })
  .middleware([requireAuthMiddleware])
  .handler(async ({ context }) => {
    const student = await getOrCreateStudent(context.user as any)
    const allSubjects = await db.select().from(subjects).orderBy(asc(subjects.sortOrder))
    const allItems = await db.select().from(assessmentItems).orderBy(asc(assessmentItems.sortOrder))
    const myScores = await db
      .select()
      .from(studentScores)
      .where(eq(studentScores.studentId, student.id))

    const scoreByItem = new Map(myScores.map((s) => [s.assessmentItemId, s.score]))
    const myResults = await db.select().from(studentSubjectResults)
      .where(eq(studentSubjectResults.studentId, student.id))
    const resultBySubject = new Map(myResults.map((result) => [result.subjectId, result.result]))

    return allSubjects.map((subject) => ({
      ...subject,
      myResult: resultBySubject.get(subject.id) ?? null,
      items: allItems
        .filter((item) => item.subjectId === subject.id)
        .map((item) => ({
          ...item,
          myScore: scoreByItem.get(item.id) ?? null,
        })),
    }))
  })

export const saveMyScore = createServerFn({ method: 'POST' })
  .middleware([requireAuthMiddleware])
  .inputValidator(z.object({ assessmentItemId: z.number().int(), score: z.number().min(0).max(9999.99).nullable() }))
  .handler(async ({ context, data }) => {
    const student = await getOrCreateStudent(context.user as any)
    const [item] = await db
      .select()
      .from(assessmentItems)
      .where(eq(assessmentItems.id, data.assessmentItemId))
      .limit(1)
    if (!item) throw new Error('Assessment item not found')
    const [subject] = await db.select().from(subjects).where(eq(subjects.id, item.subjectId)).limit(1)
    if (subject.gradingType === 'pass_fail') throw new Error('P/F 과목에는 숫자 점수를 입력할 수 없습니다.')

    const maxScore = maximumScore(item)
    if (data.score !== null && maxScore !== null && data.score > maxScore) {
      throw new Error(`Score cannot exceed ${maxScore} for this item`)
    }

    if (data.score === null) {
      await db.delete(studentScores).where(and(
        eq(studentScores.studentId, student.id),
        eq(studentScores.assessmentItemId, data.assessmentItemId),
      ))
      return null
    }

    const [created] = await db
      .insert(studentScores)
      .values({
        studentId: student.id,
        assessmentItemId: data.assessmentItemId,
        score: String(data.score),
      })
      .onConflictDoUpdate({
        target: [studentScores.studentId, studentScores.assessmentItemId],
        set: { score: String(data.score), updatedAt: new Date() },
      })
      .returning()
    return created
  })

export const saveMyResult = createServerFn({ method: 'POST' })
  .middleware([requireAuthMiddleware])
  .inputValidator(z.object({ subjectId: z.number().int(), result: z.enum(['P', 'F']).nullable() }))
  .handler(async ({ context, data }) => {
    const student = await getOrCreateStudent(context.user as any)
    const [subject] = await db.select().from(subjects).where(eq(subjects.id, data.subjectId)).limit(1)
    if (!subject || subject.gradingType !== 'pass_fail') throw new Error('P/F 과목이 아닙니다.')
    if (data.result === null) {
      await db.delete(studentSubjectResults).where(and(
        eq(studentSubjectResults.studentId, student.id),
        eq(studentSubjectResults.subjectId, data.subjectId),
      ))
      return null
    }
    const [saved] = await db.insert(studentSubjectResults).values({
      studentId: student.id,
      subjectId: data.subjectId,
      result: data.result,
    }).onConflictDoUpdate({
      target: [studentSubjectResults.studentId, studentSubjectResults.subjectId],
      set: { result: data.result, updatedAt: new Date() },
    }).returning()
    return saved
  })

export const getAdminStats = createServerFn({ method: 'GET' })
  .middleware([requireAdminMiddleware])
  .handler(async () => {
    const allStudents = await db.select().from(students)
    const allSubjects = await db.select().from(subjects).orderBy(asc(subjects.sortOrder))
    const allItems = await db.select().from(assessmentItems)
    const allScores = await db.select().from(studentScores)
    const allResults = await db.select().from(studentSubjectResults)

    const itemsBySubject = new Map<number, typeof allItems>()
    for (const item of allItems) {
      const list = itemsBySubject.get(item.subjectId) ?? []
      list.push(item)
      itemsBySubject.set(item.subjectId, list)
    }

    const scoresByStudentItem = new Map(
      allScores.filter((score) => score.score !== null)
        .map((score) => [`${score.studentId}:${score.assessmentItemId}`, Number(score.score)]),
    )

    const predictionsByStudent = new Map(allStudents.map((student) => [
      student.id,
      new Map(allSubjects.map((subject) => [
        subject.id,
        subject.gradingType === 'pass_fail' ? null : predictGrade((itemsBySubject.get(subject.id) ?? []).map((item) => ({
          ...item,
          score: scoresByStudentItem.get(`${student.id}:${item.id}`) ?? null,
        }))),
      ])),
    ]))

    const subjectStats = allSubjects.map((subject) => {
      const passFail = subject.gradingType === 'pass_fail'
      const items = (itemsBySubject.get(subject.id) ?? []).filter((item) => item.points !== null)
      const totalPossible = items.reduce(
        (sum, item) => sum + (weightedMaximum(item) ?? 0),
        0,
      )

      const studentTotals = allStudents
        .map((student) => {
          if (passFail) return null
          const hasAnyScore = items.some((item) =>
            scoresByStudentItem.has(`${student.id}:${item.id}`),
          )
          if (!hasAnyScore) return null
          const total = items.reduce(
            (sum, item) => sum + (weightedScore(item, scoresByStudentItem.get(`${student.id}:${item.id}`) ?? null) ?? 0),
            0,
          )
          return total
        })
        .filter((v): v is number => v !== null)

      const count = studentTotals.length
      const average = count ? studentTotals.reduce((a, b) => a + b, 0) / count : null
      const max = count ? Math.max(...studentTotals) : null
      const min = count ? Math.min(...studentTotals) : null
      const results = allResults.filter((result) => result.subjectId === subject.id)
      const predictions = allStudents.flatMap((student) => {
        const prediction = predictionsByStudent.get(student.id)?.get(subject.id)
        return prediction ? [prediction] : []
      })
      const averagePredictedScore = predictions.length
        ? Number((predictions.reduce((sum, prediction) => sum + prediction.score, 0) / predictions.length).toFixed(10))
        : null
      const averageSubjectGpa = predictions.length
        ? predictions.reduce((sum, prediction) => sum + prediction.gpa, 0) / predictions.length
        : null

      return {
        subjectId: subject.id,
        name: subject.name,
        category: subject.category,
        gradingType: subject.gradingType,
        totalPossible: passFail || !items.length ? null : totalPossible,
        studentsRecorded: passFail ? results.length : count,
        passes: results.filter((result) => result.result === 'P').length,
        fails: results.filter((result) => result.result === 'F').length,
        average,
        max,
        min,
        averagePredictedScore,
        averageGrade: gradeForScore(averagePredictedScore)?.grade ?? null,
        averageGpa: averageSubjectGpa,
        studentsPredicted: predictions.length,
      }
    })

    return {
      studentCount: allStudents.length,
      subjectStats,
      students: allStudents.map((student) => {
        const summary = averageGpa(allSubjects.map((subject) => ({
          credits: subject.credits,
          gpa: predictionsByStudent.get(student.id)?.get(subject.id)?.gpa ?? null,
        })))
        return {
          id: student.id,
          name: student.name,
          email: student.email,
          averageGpa: summary.gpa,
          gpaCredits: summary.credits,
          gradedSubjects: summary.subjectCount,
        }
      }),
    }
  })
