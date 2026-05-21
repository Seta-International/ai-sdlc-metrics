export type User = {
  user_id: string
  name: string
  email: string
  project: string
  role: string
  rbac_role: string
  skills: string
}

export type Plan = {
  plan_id: string
  title: string
  description: string
  tags: string
  owner: string
}

export type PlanMember = {
  plan_id: string
  member_id: string
}

export type Bucket = {
  bucket_id: string
  plan_id: string
  name: string
}

export type ChecklistItem = { text: string; done: boolean }
export type Comment = { by: string; at: string; text: string }
export type Attachment = { name: string; url: string; type: string }

export type Task = {
  task_id: string
  plan_id: string
  bucket_id: string
  assignee_ids: string
  title: string
  description: string
  status: 'todo' | 'in progress' | 'done'
  priority: 1 | 3 | 5 | 9
  due_date: string
  tags: string
  checklist: ChecklistItem[]
  comments: Comment[]
  attachments: Attachment[]
}

export type LeaveEntry = {
  leave_id: string
  employee_id: string
  start_date: string
  end_date: string
  type: 'annual' | 'sick' | 'personal' | 'unpaid'
  status: 'approved' | 'pending' | 'rejected'
}

export type Dataset = {
  users: User[]
  plans: Plan[]
  plan_members: PlanMember[]
  buckets: Bucket[]
  tasks: Task[]
  timesheet: LeaveEntry[]
}
