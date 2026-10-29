import type { School } from './types'

export const gsu: School = {
  id: 'gsu',
  name: 'Georgia State University',
  shortName: 'GSU',
  aliases: ['gsu', 'georgia state', 'georgia state university', 'ga state', 'georgia st', 'gosolar', 'go solar'],
  banner: {
    baseUrl: 'https://registration.gosolar.gsu.edu/StudentRegistrationSsb',
    registerSite: 'gosolar.gsu.edu',
    subjectAliases: {
      CSCI: 'CSC',
      CS: 'CSC',
      ECO: 'ECON',
      ENG: 'ENGL',
      ENGLISH: 'ENGL',
      ECONOMICS: 'ECON',
      BIO: 'BIOL',
      BIOLOGY: 'BIOL',
      CHEM: 'CHEM',
      MATH: 'MATH',
      PHYS: 'PHYS',
      PHYSICS: 'PHYS',
      PSYCH: 'PSYC',
      PSYCHOLOGY: 'PSYC',
      COMM: 'SCOM',
      COMMUNICATIONS: 'SCOM',
    },
  },
}
