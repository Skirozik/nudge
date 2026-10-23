import type { School } from './types'

// Schools students ask about that aren't built yet. Listing them lets the
// "coming soon" reply use the proper name and keeps their requests countable.

export const uga: School = {
  id: 'uga',
  name: 'University of Georgia',
  shortName: 'UGA',
  aliases: ['uga', 'university of georgia', 'athena'],
}

export const kennesaw: School = {
  id: 'kennesaw',
  name: 'Kennesaw State University',
  shortName: 'Kennesaw State',
  aliases: ['ksu', 'kennesaw', 'kennesaw state', 'kennesaw state university', 'owl express'],
}
