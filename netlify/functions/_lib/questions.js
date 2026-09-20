// ===========================================================================
// The question bank — SERVER SIDE ONLY.
//
// This module is imported exclusively by Netlify Functions. Vite never
// bundles it, so `answer` never reaches a delegate's browser. Clients get
// question text and the four options via publicQuestion(); correctness comes
// back only in the response to their own submission, after they have
// committed to a choice.
//
// Source: PMI_UAE_Annual_Gathering_Kahoot_Quiz.docx (3 rounds × 10 questions)
// ===========================================================================

export const ROUNDS = [
  { id: 1, title: 'UAE Mega Projects',        subtitle: 'Shaping the skyline, the grid and the rails' },
  { id: 2, title: 'Sustainability Challenge', subtitle: 'Net zero, circular economy and green delivery' },
  { id: 3, title: 'PMI UAE Chapter',          subtitle: 'How well do you know your Chapter?' },
]

export const QUESTIONS = [
  // ---------------------------------------------------------------- ROUND 1
  { round: 1, q: 'Which UAE landmark is the tallest building in the world?',
    options: ['Burj Al Arab', 'Burj Khalifa', 'Cayan Tower', 'Emirates Towers'], answer: 'B' },

  { round: 1, q: 'Etihad Rail is primarily designed to connect…',
    options: ['Only Dubai and Abu Dhabi', 'UAE airports',
              'The UAE’s emirates and wider GCC rail network', 'UAE shopping malls'], answer: 'C' },

  { round: 1, q: 'The Mohammed bin Rashid Al Maktoum Solar Park is located in which emirate?',
    options: ['Abu Dhabi', 'Dubai', 'Sharjah', 'Fujairah'], answer: 'B' },

  { round: 1, q: 'What is the revised planned capacity of the Mohammed bin Rashid Solar Park by 2030?',
    options: ['3,000 MW', '5,000 MW', 'Over 8,000 MW', '15,000 MW'], answer: 'C' },

  { round: 1, q: 'The Barakah Nuclear Energy Plant is located in…',
    options: ['Abu Dhabi Emirate', 'Dubai', 'Ras Al Khaimah', 'Sharjah'], answer: 'A' },

  { round: 1, q: 'Palm Jumeirah is best described as…',
    options: ['An artificial island development', 'A solar farm',
              'A railway terminal', 'A nature reserve'], answer: 'A' },

  { round: 1, q: 'Which UAE project uses pumped-storage hydropower?',
    options: ['Masdar City', 'Hatta Hydroelectric Plant', 'Expo City Dubai', 'Etihad Rail'], answer: 'B' },

  { round: 1, q: 'Which Dubai development hosted Expo 2020 Dubai?',
    options: ['Dubai South', 'Expo City Dubai', 'Dubai Marina', 'DIFC'], answer: 'B' },

  { round: 1, q: 'What makes the Louvre Abu Dhabi roof particularly famous?',
    options: ['It rotates', 'It produces artificial snow',
              'Its “rain of light” effect', 'It is entirely glass'], answer: 'C' },

  { round: 1, q: 'What do Burj Khalifa, Etihad Rail and the UAE’s major energy developments all need to succeed?',
    options: ['Good luck', 'Project management', 'More meetings', 'Unlimited budget'], answer: 'B' },

  // ---------------------------------------------------------------- ROUND 2
  { round: 2, q: 'What does the “S” in ESG stand for?',
    options: ['Sustainable', 'Social', 'Strategy', 'Safety'], answer: 'B' },

  { round: 2, q: 'What is the UAE’s national net-zero target year?',
    options: ['2030', '2040', '2050', '2071'], answer: 'C' },

  { round: 2, q: 'Which is a renewable source of energy?',
    options: ['Natural gas', 'Coal', 'Solar', 'Diesel'], answer: 'C' },

  { round: 2, q: 'What is a carbon footprint?',
    options: ['The amount of land a person owns',
              'Greenhouse-gas emissions associated with an activity/entity',
              'The size of a solar panel', 'A recycling symbol'], answer: 'B' },

  { round: 2, q: 'Which action best supports a circular economy?',
    options: ['Use → throw away → replace', 'Repair → reuse → recycle',
              'Buy more → store more', 'Burn all waste'], answer: 'B' },

  { round: 2, q: 'Which UAE city was designed as a major sustainable urban development?',
    options: ['Masdar City', 'Dubai Marina', 'International City', 'Deira'], answer: 'A' },

  { round: 2, q: 'The UAE Energy Strategy 2050 aims to do what to renewable energy’s contribution by 2030?',
    options: ['Reduce it', 'Keep it unchanged', 'Double it', 'Triple it'], answer: 'D' },

  { round: 2, q: 'Which choice usually produces less single-use waste at an event?',
    options: ['Individual plastic bottles', 'Refillable water stations',
              'Disposable cups for everyone', 'Individually wrapped items'], answer: 'B' },

  { round: 2, q: 'In project management, sustainability should ideally be considered…',
    options: ['Only at project closure', 'Only when the client asks',
              'Throughout the project life cycle', 'After the budget is approved'], answer: 'C' },

  { round: 2, q: 'Which statement best captures sustainable project management?',
    options: ['Finish at any cost',
              'Deliver value while considering long-term environmental and social impacts',
              'Avoid all project risks', 'Always choose the cheapest option'], answer: 'B' },

  // ---------------------------------------------------------------- ROUND 3
  { round: 3, q: 'In what year was the PMI UAE Chapter chartered?',
    options: ['2004', '2009', '2014', '2019'], answer: 'C' },

  { round: 3, q: 'PMI UAE Chapter serves how many emirates?',
    options: ['5', '6', '7', '8'], answer: 'C' },

  { round: 3, q: 'Which of these is a benefit of PMI UAE Chapter membership?',
    options: ['Earning PDUs', 'Networking', 'Volunteering', 'All of these'], answer: 'D' },

  { round: 3, q: 'Who is currently listed as President of the PMI UAE Chapter?',
    options: ['Amina Abdul Rahim', 'Pierre Le Manh',
              'Antonio Nieto-Rodriguez', 'Sunil Prashara'], answer: 'A' },

  { round: 3, q: 'Which of these appears among PMI UAE Chapter’s stated values?',
    options: ['Competition', 'Collaboration', 'Perfection', 'Profitability'], answer: 'B' },

  { round: 3, q: 'PMI UAE Chapter’s vision includes turning _____ into reality.',
    options: ['budgets', 'meetings', 'ideas', 'reports'], answer: 'C' },

  { round: 3, q: 'Which opportunity is available through PMI UAE Chapter membership?',
    options: ['Earn PDUs', 'Volunteer', 'Network with professionals', 'All of these'], answer: 'D' },

  { round: 3, q: 'Which of these is also one of the Chapter’s stated values?',
    options: ['Accountability', 'Authority', 'Ambition', 'Automation'], answer: 'A' },

  { round: 3, q: 'PMI UAE Chapter was established primarily to support which professional community?',
    options: ['Medical professionals', 'Project management professionals',
              'Architects only', 'Accountants only'], answer: 'B' },

  { round: 3, q: 'What makes a professional chapter strong?',
    options: ['The Board alone', 'Sponsors alone', 'Volunteers alone',
              'Members, volunteers, leaders & partners working together'], answer: 'D' },
]

export const TOTAL_QUESTIONS = QUESTIONS.length

/** Strip the answer key. This is the only shape a browser ever receives. */
export function publicQuestion(index) {
  const q = QUESTIONS[index]
  if (!q) return null
  const round = ROUNDS.find((r) => r.id === q.round)
  // Position of this question within its own round, for "Question 3 of 10".
  const inRound = QUESTIONS.slice(0, index).filter((x) => x.round === q.round).length + 1
  const roundTotal = QUESTIONS.filter((x) => x.round === q.round).length
  return {
    index,
    number: index + 1,
    total: TOTAL_QUESTIONS,
    round: q.round,
    roundTitle: round?.title ?? '',
    roundSubtitle: round?.subtitle ?? '',
    inRound,
    roundTotal,
    text: q.q,
    options: q.options,
  }
}

/** True when `index` is the first question of its round — the screen shows an intro card. */
export function isRoundOpener(index) {
  if (index <= 0) return index === 0
  return QUESTIONS[index]?.round !== QUESTIONS[index - 1]?.round
}

export function correctAnswerFor(index) {
  return QUESTIONS[index]?.answer ?? null
}
