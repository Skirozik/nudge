/**
 * A school SeatSnipe knows about. It is live (asks Banner, creates watches,
 * sends alerts) only when it has a `banner` config AND its id is listed in
 * the ENABLED_SCHOOLS env var. Without both, students who name it get
 * "SeatSnipe isn't at <school> yet, but it's coming soon!".
 */
export interface School {
  /** Stored on users, watches and seat events. Never change it once a school is live. */
  id: string
  /** Full name, e.g. "Georgia State University". */
  name: string
  /** What students call it; used in texts, e.g. "GSU". */
  shortName: string
  /**
   * Lowercase names students might type, compared after punctuation is
   * stripped ("Georgia St." → "georgia st"). The id always matches too.
   */
  aliases: string[]
  /** Present once the school's registration system is mapped and tested. */
  banner?: BannerConfig
}

/** Everything that differs between Ellucian Banner 9 schools. */
export interface BannerConfig {
  /** Root of the student registration app, ending in /StudentRegistrationSsb. */
  baseUrl: string
  /** Where students register, named in seat alerts, e.g. "gosolar.gsu.edu". */
  registerSite: string
  /** Abbreviations students type → this school's subject codes, e.g. { CSCI: 'CSC' }. */
  subjectAliases: Record<string, string>
}
