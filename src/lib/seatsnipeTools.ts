import { prisma } from './prisma'
import { bannerFor } from './banner'
import { createWatch, logMetric } from './watches'
import { getSchool, isLive, liveSchools, resolveSchool } from './schools'

/** Sent when a student asks for a watch before picking a school. */
export const NEED_SCHOOL_MESSAGE = 'You need to choose your school first before I can watch a class for you.'

/** A watch request saved before the student picked a school expires after this. */
export const PENDING_WATCH_TTL_MS = 24 * 60 * 60 * 1000

export function comingSoonMessage(schoolName: string): string {
  return `SeatSnipe isn't at ${schoolName} yet, but it's coming soon!`
}

export function isPendingFresh(savedAt: Date | null | undefined, now = Date.now()): boolean {
  return !!savedAt && now - savedAt.getTime() < PENDING_WATCH_TTL_MS
}

function liveSchoolNames(): string[] {
  return liveSchools().map((s) => s.shortName)
}

/**
 * watch_course tool. The guardrail lives here, not in the prompt: no school on
 * the user means no Banner lookup and no watch, whatever the model decides.
 */
export async function watchCourse(
  userId: string,
  input: { query: string; term?: string }
): Promise<Record<string, unknown>> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { school: true, source: true } })

  if (!user?.school) {
    // Keep the request so it runs as soon as they pick a school
    await prisma.user.update({
      where: { id: userId },
      data: { pendingWatchQuery: input.query, pendingWatchAt: new Date() },
    })
    return { needsSchool: true, message: NEED_SCHOOL_MESSAGE, schools: liveSchoolNames(), savedRequest: input.query }
  }

  const school = getSchool(user.school)
  if (!isLive(school)) {
    return { error: `SeatSnipe isn't running at ${school?.name ?? user.school} right now, so I can't watch a class there.` }
  }

  const parts = input.query.trim().split(/\s+/)
  // Require at least subject + courseNumber ("CSC 1301L")
  // Optional third token is the CRN ("CSC 1301L 90474") — creates watch directly
  if (parts.length < 2) {
    return { error: 'Provide a course code like "CSC 1301L" or "CSC 1301L 90474" to watch a specific section.' }
  }

  const banner = bannerFor(school.id)
  const activeTerm = input.term ?? (await banner.getActiveTerm())
  const [rawSubject, rawNumber, ...rest] = parts
  const subject = banner.normalizeSubject(rawSubject)
  const courseNumber = rawNumber.toUpperCase()
  const specificCrn = rest.find((p) => /^\d+$/.test(p)) ?? null

  const sections = await banner.searchByCourse(activeTerm, subject, courseNumber)
  if (!sections.length) {
    return { sections: [], message: `No sections found for ${subject} ${courseNumber} at ${school.shortName} this term.` }
  }

  if (specificCrn) {
    const section = sections.find((s) => s.crn === specificCrn)
    if (!section) {
      return { error: `CRN ${specificCrn} not found in ${subject} ${courseNumber} sections.` }
    }
    const result = await createWatch({
      userId,
      school: school.id,
      term: activeTerm,
      crn: specificCrn,
      courseCode: section.courseCode,
      sectionLabel: section.sectionLabel,
      source: user.source ?? null,
      initialSeats: section.seatsAvailable,
    })
    if (result.error) return { error: result.error }
    return {
      success: true,
      school: school.shortName,
      crn: section.crn,
      courseCode: section.courseCode,
      sectionLabel: section.sectionLabel,
      seatsAvailable: section.seatsAvailable,
    }
  }

  // No CRN specified — return section list for user to pick
  return {
    school: school.shortName,
    sections: sections.map((s, i) => ({
      index: i + 1,
      crn: s.crn,
      label: s.sectionLabel,
      seats: s.seatsAvailable,
    })),
  }
}

/**
 * set_school tool: first pick or a later switch. Switching never cancels
 * watches; each watch keeps its own school, so only new watches change.
 */
export async function setSchool(userId: string, input: { school: string }): Promise<Record<string, unknown>> {
  const said = (input.school ?? '').trim()
  if (!said) return { error: 'No school given. Ask which school they go to.', schools: liveSchoolNames() }

  const school = resolveSchool(said)
  if (!isLive(school)) {
    // Not offered yet. Record what they asked for so demand is visible, and
    // drop any saved request since it can't run anywhere.
    await logMetric('school_requested', userId, { said, schoolId: school?.id ?? null })
    await prisma.user.update({ where: { id: userId }, data: { pendingWatchQuery: null, pendingWatchAt: null } })
    return { comingSoon: true, message: comingSoonMessage(school?.shortName ?? said) }
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { school: true, pendingWatchQuery: true, pendingWatchAt: true },
  })
  await prisma.user.update({
    where: { id: userId },
    data: { school: school.id, pendingWatchQuery: null, pendingWatchAt: null },
  })

  const result: Record<string, unknown> = { success: true, school: school.shortName }
  if (user?.school && user.school !== school.id) {
    result.switchedFrom = getSchool(user.school)?.shortName ?? user.school
    result.note = 'Their existing watches keep running. Only new watches use the new school.'
  }
  if (user?.pendingWatchQuery && isPendingFresh(user.pendingWatchAt)) {
    result.savedRequest = user.pendingWatchQuery
    result.savedRequestResult = await watchCourse(userId, { query: user.pendingWatchQuery })
  }
  return result
}
