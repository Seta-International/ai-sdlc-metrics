// Shared mock data for the People module prototype
window.PeopleData = (() => {
  const DEPARTMENTS = [
    { id: 'eng', name: 'Engineering', color: '#7170ff' },
    { id: 'prod', name: 'Product', color: '#10b981' },
    { id: 'design', name: 'Design', color: '#f59e0b' },
    { id: 'ops', name: 'People Ops', color: '#ef4444' },
    { id: 'gtm', name: 'Go-to-Market', color: '#06b6d4' },
    { id: 'fin', name: 'Finance', color: '#a855f7' },
  ]

  const LOCATIONS = [
    'Hanoi',
    'Ho Chi Minh City',
    'Singapore',
    'Da Nang',
    'Remote — APAC',
    'Remote — EU',
  ]

  const JOB_TITLES = {
    eng: [
      'Staff Engineer',
      'Senior Backend Eng',
      'Frontend Eng',
      'Platform Eng',
      'SRE',
      'Eng Manager',
      'Mobile Engineer',
    ],
    prod: ['Senior PM', 'Product Manager', 'Group PM', 'Associate PM', 'Product Ops'],
    design: [
      'Staff Designer',
      'Product Designer',
      'Design Lead',
      'Design Systems',
      'Brand Designer',
    ],
    ops: ['HR Business Partner', 'People Ops Lead', 'Talent Acquisition', 'L&D Specialist'],
    gtm: ['Account Exec', 'Sales Engineer', 'Marketing Manager', 'Customer Success', 'Revenue Ops'],
    fin: ['FP&A Analyst', 'Controller', 'Finance Manager', 'Procurement'],
  }

  const FIRST = [
    'Alex',
    'Priya',
    'Diego',
    'Mei',
    'Yusuf',
    'Lena',
    'Kofi',
    'Sana',
    'Ravi',
    'Noa',
    'Ines',
    'Elena',
    'Omar',
    'Hiro',
    'Ana',
    'Kai',
    'Sato',
    'Juno',
    'Theo',
    'Iris',
    'Nabil',
    'Ada',
    'Finn',
    'Clara',
    'Mina',
    'Luca',
    'Nora',
    'Kaito',
    'Maya',
    'Leo',
    'Zara',
    'Kwame',
    'Nia',
    'Pilar',
    'Tomas',
    'Valeria',
    'Arjun',
    'Sofia',
    'Mateo',
    'Isla',
    'Jude',
    'Aiko',
    'Emil',
    'Linh',
    'Hana',
    'Seb',
    'Aya',
    'Nikolai',
    'Gabi',
    'Otis',
  ]
  const LAST = [
    'Patel',
    'Okafor',
    'Sato',
    'Nguyen',
    'Lopez',
    'Ribeiro',
    'Tanaka',
    'Kim',
    'Ali',
    'Dubois',
    'Silva',
    'Chen',
    'Rossi',
    'Yilmaz',
    'Haider',
    'Dupont',
    'Andersen',
    'Volkov',
    'Park',
    'Rahman',
    'Costa',
    'Banerjee',
    'Müller',
    'Oyelaran',
    'Hassan',
    'Toma',
    'Pereira',
    'Oduya',
    'Fernández',
    'Kowalski',
    'Abebe',
    'Alvarado',
    'Cruz',
    'Holm',
    'Watanabe',
    'Jankowski',
  ]

  // deterministic pseudo-random
  let seed = 7
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    return seed / 0x7fffffff
  }
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)]

  const STATUSES = [
    'Active',
    'Active',
    'Active',
    'Active',
    'Active',
    'Probation',
    'On leave',
    'Pending start',
  ]

  const EMPLOYEES = Array.from({ length: 48 }, (_, i) => {
    const dept = DEPARTMENTS[i % DEPARTMENTS.length]
    const first = pick(FIRST)
    const last = pick(LAST)
    const title = pick(JOB_TITLES[dept.id])
    const status = pick(STATUSES)
    const initials = (first[0] + last[0]).toUpperCase()
    // avatar hue based on dept color
    return {
      id: `emp-${i + 1}`,
      firstName: first,
      lastName: last,
      fullName: `${first} ${last}`,
      initials,
      email: `${first.toLowerCase()}.${last.toLowerCase()}@future.co`,
      title,
      department: dept.name,
      departmentId: dept.id,
      deptColor: dept.color,
      location: pick(LOCATIONS),
      country: ['VN', 'SG', 'US', 'DE', 'JP'][i % 5],
      status,
      hiredDays: Math.floor(rnd() * 1800) + 10,
      manager: i > 2 ? `emp-${((i * 7) % 3) + 1}` : null,
      level: ['L3', 'L4', 'L5', 'L6', 'L7'][i % 5],
      employmentType: i % 9 === 0 ? 'Contract' : 'Full-time',
      hasOpenChanges: i % 7 === 0,
      probationEnds: status === 'Probation' ? Math.floor(rnd() * 40) + 5 : null,
    }
  })

  const SAVED_VIEWS = [
    { id: 'all', name: 'All people', count: 247, icon: 'users' },
    { id: 'my', name: 'My reports', count: 8, icon: 'user-check' },
    { id: 'prob', name: 'In probation', count: 14, icon: 'clock' },
    { id: 'hr', name: 'HR partners', count: 6, icon: 'shield' },
    { id: 'new', name: 'Joined < 30 days', count: 11, icon: 'sparkle' },
    { id: 'leave', name: 'On leave', count: 5, icon: 'plane' },
  ]

  const CHANGE_REQUESTS = [
    {
      id: 'cr-1',
      employee: EMPLOYEES[3],
      field: 'Job title',
      from: 'Senior Engineer',
      to: 'Staff Engineer',
      reason: 'Promotion — approved in cal Q2',
      submitter: EMPLOYEES[12],
      age: '2h',
      priority: 'high',
    },
    {
      id: 'cr-2',
      employee: EMPLOYEES[7],
      field: 'Legal name',
      from: 'Priya Patel',
      to: 'Priya Patel-Kumar',
      reason: 'Marriage',
      submitter: EMPLOYEES[7],
      age: '5h',
      priority: 'normal',
    },
    {
      id: 'cr-3',
      employee: EMPLOYEES[11],
      field: 'Bank account',
      from: '•••• 4421',
      to: '•••• 9902',
      reason: 'Switched banks',
      submitter: EMPLOYEES[11],
      age: '1d',
      priority: 'normal',
    },
    {
      id: 'cr-4',
      employee: EMPLOYEES[15],
      field: 'Work location',
      from: 'Hanoi HQ',
      to: 'Remote — APAC',
      reason: 'Relocation approved by manager',
      submitter: EMPLOYEES[15],
      age: '1d',
      priority: 'normal',
    },
    {
      id: 'cr-5',
      employee: EMPLOYEES[22],
      field: 'Manager',
      from: 'Kai Tanaka',
      to: 'Mei Chen',
      reason: 'Team re-org',
      submitter: EMPLOYEES[0],
      age: '2d',
      priority: 'high',
    },
  ]

  const ONBOARDING = [
    {
      id: 'on-1',
      employee: EMPLOYEES[40],
      startDate: 'In 3 days',
      progress: 65,
      stage: 'Equipment shipped',
      tasks: { done: 13, total: 20 },
      blockers: 1,
    },
    {
      id: 'on-2',
      employee: EMPLOYEES[41],
      startDate: 'In 7 days',
      progress: 40,
      stage: 'Contract signed',
      tasks: { done: 8, total: 20 },
      blockers: 0,
    },
    {
      id: 'on-3',
      employee: EMPLOYEES[42],
      startDate: 'In 14 days',
      progress: 15,
      stage: 'Offer accepted',
      tasks: { done: 3, total: 20 },
      blockers: 0,
    },
    {
      id: 'on-4',
      employee: EMPLOYEES[43],
      startDate: 'Today',
      progress: 95,
      stage: 'First-day ready',
      tasks: { done: 19, total: 20 },
      blockers: 0,
    },
  ]

  const OFFBOARDING = [
    {
      id: 'off-1',
      employee: EMPLOYEES[5],
      lastDay: 'In 12 days',
      progress: 30,
      stage: 'Knowledge transfer',
      tasks: { done: 4, total: 14 },
      reason: 'Resignation',
    },
    {
      id: 'off-2',
      employee: EMPLOYEES[18],
      lastDay: 'In 4 days',
      progress: 80,
      stage: 'Equipment return',
      tasks: { done: 11, total: 14 },
      reason: 'End of contract',
    },
  ]

  const ACTIVITY = [
    {
      who: EMPLOYEES[0],
      what: 'approved change request for',
      target: 'Diego Ribeiro',
      when: '12m',
      kind: 'approve',
    },
    {
      who: EMPLOYEES[2],
      what: 'started onboarding for',
      target: 'Iris Banerjee',
      when: '34m',
      kind: 'onboard',
    },
    {
      who: EMPLOYEES[1],
      what: 'updated job profile',
      target: 'Staff Designer',
      when: '1h',
      kind: 'edit',
    },
    {
      who: EMPLOYEES[4],
      what: 'uploaded document for',
      target: 'Yusuf Ali',
      when: '2h',
      kind: 'doc',
    },
    {
      who: EMPLOYEES[6],
      what: 'completed probation for',
      target: 'Lena Dupont',
      when: '3h',
      kind: 'probation',
    },
  ]

  const HEADCOUNT = [
    { month: 'Nov', value: 221 },
    { month: 'Dec', value: 228 },
    { month: 'Jan', value: 232 },
    { month: 'Feb', value: 238 },
    { month: 'Mar', value: 243 },
    { month: 'Apr', value: 247 },
  ]

  const DEPT_BREAKDOWN = [
    { name: 'Engineering', count: 98, pct: 40 },
    { name: 'Go-to-Market', count: 52, pct: 21 },
    { name: 'Product', count: 31, pct: 12.5 },
    { name: 'Design', count: 22, pct: 9 },
    { name: 'People Ops', count: 14, pct: 5.5 },
    { name: 'Finance', count: 18, pct: 7 },
    { name: 'Other', count: 12, pct: 5 },
  ]

  return {
    DEPARTMENTS,
    LOCATIONS,
    EMPLOYEES,
    SAVED_VIEWS,
    CHANGE_REQUESTS,
    ONBOARDING,
    OFFBOARDING,
    ACTIVITY,
    HEADCOUNT,
    DEPT_BREAKDOWN,
  }
})()
