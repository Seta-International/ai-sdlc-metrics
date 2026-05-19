-- Infrastructure Review Use-Case — Mock Data Seed (Multi-Manager)
--
-- 3 managers, each owns 2-3 plans and a dedicated team:
--   mgr-001 (Infra)    → plan-INFRA-2026, plan-CLOUD-Q2, plan-OPS-2026
--   mgr-002 (Security) → plan-SEC-Q2, plan-PENTEST-2026
--   mgr-003 (Product)  → plan-PROD-Q2, plan-API-Q2, plan-MAINT-Q2
--
-- Access isolation is enforced by:
--   1. plan_members rows — each team member only added to their manager's plans
--   2. planner.v_visible_plans Rule 2 — manager sees any plan a direct report is on
--   3. planner.v_visible_tasks (existing) Rule 2 — manager sees tasks assigned to direct reports
--
-- Run as platform_admin (bypassRls: true):
--   psql $DATABASE_URL -f tests/fixtures/planner-mock/seed.sql
--
-- In integration tests, set tenant + user context before querying views:
--   BEGIN;
--   SELECT set_config('app.tenant_id', '550e8400-e29b-41d4-a716-446655440000', true);
--   SELECT set_config('app.user_id', 'mgr-001', true);
--   SELECT graph_task_id, title FROM planner.v_visible_tasks;
--   ROLLBACK;

\set TENANT_ID '550e8400-e29b-41d4-a716-446655440000'

-- ─── Directory Users ──────────────────────────────────────────────────────────
-- skills and presence stored in raw jsonb (no dedicated skills module)
-- presence.availability: Available | Busy
-- presence.activity:     Available | InAMeeting | InACall | DoNotDisturb

INSERT INTO connector_ms365_directory.directory_users
  (tenant_id, entra_object_id, user_principal_name, mail, display_name, manager_id, raw, synced_at)
VALUES

-- ── Managers ─────────────────────────────────────────────────────────────────
(:'TENANT_ID', 'mgr-001', 'dung.nguyen@seta-international.vn', 'dung.nguyen@seta-international.vn',
  'Nguyễn Văn Dũng', NULL,
  '{"jobTitle":"Infrastructure Manager","department":"Infrastructure","presence":{"availability":"Available","activity":"Available"},"skills":["kubernetes","terraform","aws","linux","cloud-architecture"]}',
  NOW()),

(:'TENANT_ID', 'mgr-002', 'huong.pham@seta-international.vn', 'huong.pham@seta-international.vn',
  'Phạm Thị Hương', NULL,
  '{"jobTitle":"Security Manager","department":"Security","presence":{"availability":"Available","activity":"Available"},"skills":["security","compliance","azure-ad","oauth","audit"]}',
  NOW()),

(:'TENANT_ID', 'mgr-003', 'tuan.le@seta-international.vn', 'tuan.le@seta-international.vn',
  'Lê Minh Tuấn', NULL,
  '{"jobTitle":"Product Manager","department":"Product","presence":{"availability":"Available","activity":"Available"},"skills":["product-management","agile","nodejs","postgresql"]}',
  NOW()),

-- ── Infrastructure Team (reports to mgr-001) ─────────────────────────────────
(:'TENANT_ID', 'inf-001', 'an.tran@seta-international.vn', 'an.tran@seta-international.vn',
  'Trần Văn An', 'mgr-001',
  '{"jobTitle":"DevOps Engineer","department":"Infrastructure","presence":{"availability":"Available","activity":"Available"},"skills":["kubernetes","docker","terraform","aws","linux"]}',
  NOW()),

(:'TENANT_ID', 'inf-002', 'bich.nguyen@seta-international.vn', 'bich.nguyen@seta-international.vn',
  'Nguyễn Thị Bích', 'mgr-001',
  '{"jobTitle":"Cloud Architect","department":"Infrastructure","presence":{"availability":"Available","activity":"Available"},"skills":["aws","azure","terraform","cloud-architecture","kubernetes"]}',
  NOW()),

(:'TENANT_ID', 'inf-003', 'cuong.le@seta-international.vn', 'cuong.le@seta-international.vn',
  'Lê Hoàng Cường', 'mgr-001',
  '{"jobTitle":"Infrastructure Engineer","department":"Infrastructure","presence":{"availability":"Busy","activity":"InAMeeting"},"skills":["linux","networking","cisco","vmware","storage"]}',
  NOW()),

(:'TENANT_ID', 'inf-004', 'quynh.bui@seta-international.vn', 'quynh.bui@seta-international.vn',
  'Bùi Thị Quỳnh', 'mgr-001',
  '{"jobTitle":"DevOps Engineer","department":"Infrastructure","presence":{"availability":"Available","activity":"Available"},"skills":["docker","ci-cd","github-actions","terraform","aws"]}',
  NOW()),

(:'TENANT_ID', 'inf-005', 'son.cao@seta-international.vn', 'son.cao@seta-international.vn',
  'Cao Minh Sơn', 'mgr-001',
  '{"jobTitle":"Network Engineer","department":"Infrastructure","presence":{"availability":"Available","activity":"Available"},"skills":["networking","cisco","firewall","vpn","dns","load-balancing"]}',
  NOW()),

(:'TENANT_ID', 'inf-006', 'phong.nguyen@seta-international.vn', 'phong.nguyen@seta-international.vn',
  'Nguyễn Thanh Phong', 'mgr-001',
  '{"jobTitle":"Site Reliability Engineer","department":"Infrastructure","presence":{"availability":"Busy","activity":"DoNotDisturb"},"skills":["kubernetes","monitoring","prometheus","grafana","linux","incident-response"]}',
  NOW()),

-- ── Security Team (reports to mgr-002) ───────────────────────────────────────
(:'TENANT_ID', 'sec-001', 'duc.hoang@seta-international.vn', 'duc.hoang@seta-international.vn',
  'Hoàng Văn Đức', 'mgr-002',
  '{"jobTitle":"Security Engineer","department":"Security","presence":{"availability":"Available","activity":"Available"},"skills":["security","azure-ad","oauth","compliance","penetration-testing"]}',
  NOW()),

(:'TENANT_ID', 'sec-002', 'linh.tran@seta-international.vn', 'linh.tran@seta-international.vn',
  'Trần Thị Linh', 'mgr-002',
  '{"jobTitle":"Security Analyst","department":"Security","presence":{"availability":"Available","activity":"Available"},"skills":["security","compliance","audit","azure-ad","siem"]}',
  NOW()),

(:'TENANT_ID', 'sec-003', 'khoa.vu@seta-international.vn', 'khoa.vu@seta-international.vn',
  'Vũ Minh Khoa', 'mgr-002',
  '{"jobTitle":"Network Security Engineer","department":"Security","presence":{"availability":"Busy","activity":"InACall"},"skills":["firewall","vpn","networking","security","ids-ips"]}',
  NOW()),

(:'TENANT_ID', 'sec-004', 'ha.do@seta-international.vn', 'ha.do@seta-international.vn',
  'Đỗ Thị Hà', 'mgr-002',
  '{"jobTitle":"AppSec Engineer","department":"Security","presence":{"availability":"Available","activity":"Available"},"skills":["security","oauth","api-security","owasp","nodejs"]}',
  NOW()),

-- ── Product Team (reports to mgr-003) ────────────────────────────────────────
(:'TENANT_ID', 'prd-001', 'hung.vu@seta-international.vn', 'hung.vu@seta-international.vn',
  'Vũ Quốc Hùng', 'mgr-003',
  '{"jobTitle":"Backend Developer","department":"Engineering","presence":{"availability":"Available","activity":"Available"},"skills":["nodejs","typescript","postgresql","microservices","docker"]}',
  NOW()),

(:'TENANT_ID', 'prd-002', 'mai.do@seta-international.vn', 'mai.do@seta-international.vn',
  'Đỗ Thị Mai', 'mgr-003',
  '{"jobTitle":"Frontend Developer","department":"Engineering","presence":{"availability":"Available","activity":"Available"},"skills":["react","typescript","ui-design","css","figma"]}',
  NOW()),

(:'TENANT_ID', 'prd-003', 'khai.nguyen@seta-international.vn', 'khai.nguyen@seta-international.vn',
  'Nguyễn Văn Khải', 'mgr-003',
  '{"jobTitle":"Full Stack Developer","department":"Engineering","presence":{"availability":"Available","activity":"Available"},"skills":["nodejs","react","postgresql","typescript"]}',
  NOW()),

(:'TENANT_ID', 'prd-004', 'lan.hoang@seta-international.vn', 'lan.hoang@seta-international.vn',
  'Hoàng Thị Lan', 'mgr-003',
  '{"jobTitle":"Database Administrator","department":"Engineering","presence":{"availability":"Busy","activity":"InAMeeting"},"skills":["postgresql","mongodb","redis","backup-recovery","performance-tuning"]}',
  NOW())

ON CONFLICT (tenant_id, entra_object_id) DO UPDATE
  SET display_name = EXCLUDED.display_name,
      manager_id   = EXCLUDED.manager_id,
      raw          = EXCLUDED.raw,
      synced_at    = EXCLUDED.synced_at;

-- ─── Plans ────────────────────────────────────────────────────────────────────

INSERT INTO connector_ms365_planner.planner_plans_cache
  (tenant_id, graph_plan_id, owner_group_id, title, etag, raw, synced_at, soft_deleted_at)
VALUES
  -- mgr-001 Infra plans
  (:'TENANT_ID', 'plan-INFRA-2026', 'grp-infra',     'Platform Infrastructure 2026',   'W/"plan-INFRA-etag"',   '{}', NOW(), NULL),
  (:'TENANT_ID', 'plan-CLOUD-Q2',   'grp-infra',     'Cloud Migration Q2 2026',         'W/"plan-CLOUD-etag"',   '{}', NOW(), NULL),
  (:'TENANT_ID', 'plan-OPS-2026',   'grp-infra',     'DevOps & Operations 2026',        'W/"plan-OPS-etag"',     '{}', NOW(), NULL),
  -- mgr-002 Security plans
  (:'TENANT_ID', 'plan-SEC-Q2',     'grp-security',  'Security & Compliance Q2 2026',   'W/"plan-SEC-etag"',     '{}', NOW(), NULL),
  (:'TENANT_ID', 'plan-PENTEST-2026','grp-security', 'Penetration Testing 2026',         'W/"plan-PENTEST-etag"', '{}', NOW(), NULL),
  -- mgr-003 Product plans
  (:'TENANT_ID', 'plan-PROD-Q2',    'grp-product',   'Product Development Q2 2026',     'W/"plan-PROD-etag"',    '{}', NOW(), NULL),
  (:'TENANT_ID', 'plan-API-Q2',     'grp-product',   'API Platform Q2 2026',            'W/"plan-API-etag"',     '{}', NOW(), NULL),
  (:'TENANT_ID', 'plan-MAINT-Q2',   'grp-product',   'Platform Maintenance Q2 2026',    'W/"plan-MAINT-etag"',   '{}', NOW(), NULL)
ON CONFLICT (tenant_id, graph_plan_id) DO UPDATE
  SET title     = EXCLUDED.title,
      synced_at = EXCLUDED.synced_at;

-- ─── Plan Members ─────────────────────────────────────────────────────────────
-- role='owner': the manager; role='member': direct reports only
-- Strict isolation: no cross-team membership

INSERT INTO connector_ms365_planner.plan_members
  (tenant_id, plan_id, user_id, role, synced_at)
VALUES
  -- plan-INFRA-2026: mgr-001 owns; inf-001, inf-002, inf-004, inf-006 are members
  (:'TENANT_ID', 'plan-INFRA-2026', 'mgr-001', 'owner',  NOW()),
  (:'TENANT_ID', 'plan-INFRA-2026', 'inf-001', 'member', NOW()),
  (:'TENANT_ID', 'plan-INFRA-2026', 'inf-002', 'member', NOW()),
  (:'TENANT_ID', 'plan-INFRA-2026', 'inf-004', 'member', NOW()),
  (:'TENANT_ID', 'plan-INFRA-2026', 'inf-006', 'member', NOW()),
  -- plan-CLOUD-Q2: mgr-001 owns; inf-001, inf-002, inf-003 are members
  (:'TENANT_ID', 'plan-CLOUD-Q2',   'mgr-001', 'owner',  NOW()),
  (:'TENANT_ID', 'plan-CLOUD-Q2',   'inf-001', 'member', NOW()),
  (:'TENANT_ID', 'plan-CLOUD-Q2',   'inf-002', 'member', NOW()),
  (:'TENANT_ID', 'plan-CLOUD-Q2',   'inf-003', 'member', NOW()),
  -- plan-OPS-2026: mgr-001 owns; inf-004, inf-005, inf-006 are members
  (:'TENANT_ID', 'plan-OPS-2026',   'mgr-001', 'owner',  NOW()),
  (:'TENANT_ID', 'plan-OPS-2026',   'inf-004', 'member', NOW()),
  (:'TENANT_ID', 'plan-OPS-2026',   'inf-005', 'member', NOW()),
  (:'TENANT_ID', 'plan-OPS-2026',   'inf-006', 'member', NOW()),
  -- plan-SEC-Q2: mgr-002 owns; sec-001, sec-002, sec-004 are members
  (:'TENANT_ID', 'plan-SEC-Q2',     'mgr-002', 'owner',  NOW()),
  (:'TENANT_ID', 'plan-SEC-Q2',     'sec-001', 'member', NOW()),
  (:'TENANT_ID', 'plan-SEC-Q2',     'sec-002', 'member', NOW()),
  (:'TENANT_ID', 'plan-SEC-Q2',     'sec-004', 'member', NOW()),
  -- plan-PENTEST-2026: mgr-002 owns; sec-001, sec-003, sec-004 are members
  (:'TENANT_ID', 'plan-PENTEST-2026','mgr-002', 'owner',  NOW()),
  (:'TENANT_ID', 'plan-PENTEST-2026','sec-001', 'member', NOW()),
  (:'TENANT_ID', 'plan-PENTEST-2026','sec-003', 'member', NOW()),
  (:'TENANT_ID', 'plan-PENTEST-2026','sec-004', 'member', NOW()),
  -- plan-PROD-Q2: mgr-003 owns; prd-001, prd-002, prd-003 are members
  (:'TENANT_ID', 'plan-PROD-Q2',    'mgr-003', 'owner',  NOW()),
  (:'TENANT_ID', 'plan-PROD-Q2',    'prd-001', 'member', NOW()),
  (:'TENANT_ID', 'plan-PROD-Q2',    'prd-002', 'member', NOW()),
  (:'TENANT_ID', 'plan-PROD-Q2',    'prd-003', 'member', NOW()),
  -- plan-API-Q2: mgr-003 owns; prd-001, prd-003, prd-004 are members
  (:'TENANT_ID', 'plan-API-Q2',     'mgr-003', 'owner',  NOW()),
  (:'TENANT_ID', 'plan-API-Q2',     'prd-001', 'member', NOW()),
  (:'TENANT_ID', 'plan-API-Q2',     'prd-003', 'member', NOW()),
  (:'TENANT_ID', 'plan-API-Q2',     'prd-004', 'member', NOW()),
  -- plan-MAINT-Q2: mgr-003 owns; prd-001, prd-002, prd-004 are members
  (:'TENANT_ID', 'plan-MAINT-Q2',   'mgr-003', 'owner',  NOW()),
  (:'TENANT_ID', 'plan-MAINT-Q2',   'prd-001', 'member', NOW()),
  (:'TENANT_ID', 'plan-MAINT-Q2',   'prd-002', 'member', NOW()),
  (:'TENANT_ID', 'plan-MAINT-Q2',   'prd-004', 'member', NOW())
ON CONFLICT (tenant_id, plan_id, user_id) DO UPDATE
  SET role      = EXCLUDED.role,
      synced_at = EXCLUDED.synced_at;

-- ─── Buckets ──────────────────────────────────────────────────────────────────
-- 4 status buckets per plan: Backlog → To Do → In Progress → Done

INSERT INTO connector_ms365_planner.planner_buckets_cache
  (tenant_id, graph_bucket_id, plan_id, name, order_hint, etag, raw, synced_at, soft_deleted_at)
VALUES
  -- plan-INFRA-2026
  (:'TENANT_ID', 'bkt-INFRA-backlog',   'plan-INFRA-2026',   'Backlog',     '8585461000000001', 'W/"b-I-1"', '{}', NOW(), NULL),
  (:'TENANT_ID', 'bkt-INFRA-todo',      'plan-INFRA-2026',   'To Do',       '8585361000000001', 'W/"b-I-2"', '{}', NOW(), NULL),
  (:'TENANT_ID', 'bkt-INFRA-progress',  'plan-INFRA-2026',   'In Progress', '8585261000000001', 'W/"b-I-3"', '{}', NOW(), NULL),
  (:'TENANT_ID', 'bkt-INFRA-done',      'plan-INFRA-2026',   'Done',        '8585161000000001', 'W/"b-I-4"', '{}', NOW(), NULL),
  -- plan-CLOUD-Q2
  (:'TENANT_ID', 'bkt-CLOUD-backlog',   'plan-CLOUD-Q2',     'Backlog',     '8585461000000002', 'W/"b-C-1"', '{}', NOW(), NULL),
  (:'TENANT_ID', 'bkt-CLOUD-todo',      'plan-CLOUD-Q2',     'To Do',       '8585361000000002', 'W/"b-C-2"', '{}', NOW(), NULL),
  (:'TENANT_ID', 'bkt-CLOUD-progress',  'plan-CLOUD-Q2',     'In Progress', '8585261000000002', 'W/"b-C-3"', '{}', NOW(), NULL),
  (:'TENANT_ID', 'bkt-CLOUD-done',      'plan-CLOUD-Q2',     'Done',        '8585161000000002', 'W/"b-C-4"', '{}', NOW(), NULL),
  -- plan-OPS-2026
  (:'TENANT_ID', 'bkt-OPS-backlog',     'plan-OPS-2026',     'Backlog',     '8585461000000003', 'W/"b-O-1"', '{}', NOW(), NULL),
  (:'TENANT_ID', 'bkt-OPS-todo',        'plan-OPS-2026',     'To Do',       '8585361000000003', 'W/"b-O-2"', '{}', NOW(), NULL),
  (:'TENANT_ID', 'bkt-OPS-progress',    'plan-OPS-2026',     'In Progress', '8585261000000003', 'W/"b-O-3"', '{}', NOW(), NULL),
  (:'TENANT_ID', 'bkt-OPS-done',        'plan-OPS-2026',     'Done',        '8585161000000003', 'W/"b-O-4"', '{}', NOW(), NULL),
  -- plan-SEC-Q2
  (:'TENANT_ID', 'bkt-SEC-backlog',     'plan-SEC-Q2',       'Backlog',     '8585461000000004', 'W/"b-S-1"', '{}', NOW(), NULL),
  (:'TENANT_ID', 'bkt-SEC-todo',        'plan-SEC-Q2',       'To Do',       '8585361000000004', 'W/"b-S-2"', '{}', NOW(), NULL),
  (:'TENANT_ID', 'bkt-SEC-progress',    'plan-SEC-Q2',       'In Progress', '8585261000000004', 'W/"b-S-3"', '{}', NOW(), NULL),
  (:'TENANT_ID', 'bkt-SEC-done',        'plan-SEC-Q2',       'Done',        '8585161000000004', 'W/"b-S-4"', '{}', NOW(), NULL),
  -- plan-PENTEST-2026
  (:'TENANT_ID', 'bkt-PENTEST-backlog', 'plan-PENTEST-2026', 'Backlog',     '8585461000000005', 'W/"b-P-1"', '{}', NOW(), NULL),
  (:'TENANT_ID', 'bkt-PENTEST-todo',    'plan-PENTEST-2026', 'To Do',       '8585361000000005', 'W/"b-P-2"', '{}', NOW(), NULL),
  (:'TENANT_ID', 'bkt-PENTEST-progress','plan-PENTEST-2026', 'In Progress', '8585261000000005', 'W/"b-P-3"', '{}', NOW(), NULL),
  (:'TENANT_ID', 'bkt-PENTEST-done',    'plan-PENTEST-2026', 'Done',        '8585161000000005', 'W/"b-P-4"', '{}', NOW(), NULL),
  -- plan-PROD-Q2
  (:'TENANT_ID', 'bkt-PROD-backlog',    'plan-PROD-Q2',      'Backlog',     '8585461000000006', 'W/"b-PD-1"','{}', NOW(), NULL),
  (:'TENANT_ID', 'bkt-PROD-todo',       'plan-PROD-Q2',      'To Do',       '8585361000000006', 'W/"b-PD-2"','{}', NOW(), NULL),
  (:'TENANT_ID', 'bkt-PROD-progress',   'plan-PROD-Q2',      'In Progress', '8585261000000006', 'W/"b-PD-3"','{}', NOW(), NULL),
  (:'TENANT_ID', 'bkt-PROD-done',       'plan-PROD-Q2',      'Done',        '8585161000000006', 'W/"b-PD-4"','{}', NOW(), NULL),
  -- plan-API-Q2
  (:'TENANT_ID', 'bkt-API-backlog',     'plan-API-Q2',       'Backlog',     '8585461000000007', 'W/"b-A-1"', '{}', NOW(), NULL),
  (:'TENANT_ID', 'bkt-API-todo',        'plan-API-Q2',       'To Do',       '8585361000000007', 'W/"b-A-2"', '{}', NOW(), NULL),
  (:'TENANT_ID', 'bkt-API-progress',    'plan-API-Q2',       'In Progress', '8585261000000007', 'W/"b-A-3"', '{}', NOW(), NULL),
  (:'TENANT_ID', 'bkt-API-done',        'plan-API-Q2',       'Done',        '8585161000000007', 'W/"b-A-4"', '{}', NOW(), NULL),
  -- plan-MAINT-Q2
  (:'TENANT_ID', 'bkt-MAINT-backlog',   'plan-MAINT-Q2',     'Backlog',     '8585461000000008', 'W/"b-M-1"', '{}', NOW(), NULL),
  (:'TENANT_ID', 'bkt-MAINT-todo',      'plan-MAINT-Q2',     'To Do',       '8585361000000008', 'W/"b-M-2"', '{}', NOW(), NULL),
  (:'TENANT_ID', 'bkt-MAINT-progress',  'plan-MAINT-Q2',     'In Progress', '8585261000000008', 'W/"b-M-3"', '{}', NOW(), NULL),
  (:'TENANT_ID', 'bkt-MAINT-done',      'plan-MAINT-Q2',     'Done',        '8585161000000008', 'W/"b-M-4"', '{}', NOW(), NULL)
ON CONFLICT (tenant_id, graph_bucket_id) DO UPDATE
  SET name = EXCLUDED.name, synced_at = EXCLUDED.synced_at;

-- ─── Tasks ────────────────────────────────────────────────────────────────────
-- priority: 0=Urgent  1=Important  5=Medium  9=Low
-- percent_complete: 0=not started  1-99=in progress  100=done
-- BLOCKED = in_progress (1-99%) AND last_modified_at_graph > 3 days ago

INSERT INTO connector_ms365_planner.planner_tasks_cache (
  tenant_id, graph_task_id, plan_id, bucket_id,
  title, percent_complete, priority, due_date,
  assignee_ids, created_by, created_at_graph,
  last_modified_by, last_modified_at_graph,
  etag, raw, synced_at, soft_deleted_at
) VALUES

-- ── plan-INFRA-2026 ───────────────────────────────────────────────────────────
('550e8400-e29b-41d4-a716-446655440000','task-I01','plan-INFRA-2026','bkt-INFRA-todo',
  'Tối ưu hóa cấu hình autoscaling Kubernetes cluster production',
  0, 0, NOW() + INTERVAL '6 days',
  ARRAY[]::text[], 'mgr-001', NOW()-INTERVAL '3 days', 'mgr-001', NOW()-INTERVAL '3 days',
  'W/"task-I01"', '{}', NOW(), NULL),

('550e8400-e29b-41d4-a716-446655440000','task-I02','plan-INFRA-2026','bkt-INFRA-todo',
  'Audit IAM roles và permissions trên toàn bộ AWS accounts',
  0, 1, NOW() + INTERVAL '9 days',
  ARRAY[]::text[], 'mgr-001', NOW()-INTERVAL '5 days', 'mgr-001', NOW()-INTERVAL '5 days',
  'W/"task-I02"', '{}', NOW(), NULL),

('550e8400-e29b-41d4-a716-446655440000','task-I03','plan-INFRA-2026','bkt-INFRA-backlog',
  'Review VPC network segmentation và routing rules production',
  0, 1, NOW() + INTERVAL '17 days',
  ARRAY[]::text[], 'inf-002', NOW()-INTERVAL '4 days', 'inf-002', NOW()-INTERVAL '4 days',
  'W/"task-I03"', '{}', NOW(), NULL),

('550e8400-e29b-41d4-a716-446655440000','task-I04','plan-INFRA-2026','bkt-INFRA-progress',
  'Setup Grafana monitoring dashboard cho toàn bộ microservices',
  50, 1, NOW() + INTERVAL '5 days',
  ARRAY['inf-006']::text[], 'inf-006', NOW()-INTERVAL '10 days', 'inf-006', NOW()-INTERVAL '1 day',
  'W/"task-I04"', '{}', NOW(), NULL),

('550e8400-e29b-41d4-a716-446655440000','task-I05','plan-INFRA-2026','bkt-INFRA-done',
  'Configure Kubernetes RBAC và network policies production cluster',
  100, 1, NOW()-INTERVAL '10 days',
  ARRAY['inf-001']::text[], 'mgr-001', NOW()-INTERVAL '30 days', 'inf-001', NOW()-INTERVAL '11 days',
  'W/"task-I05"', '{}', NOW(), NULL),

-- ── plan-CLOUD-Q2 ─────────────────────────────────────────────────────────────
('550e8400-e29b-41d4-a716-446655440000','task-C01','plan-CLOUD-Q2','bkt-CLOUD-progress',
  'Migrate legacy PHP services từ EC2 sang EKS containers',
  25, 5, NOW() + INTERVAL '14 days',
  ARRAY['inf-001']::text[], 'mgr-001', NOW()-INTERVAL '8 days', 'inf-001', NOW()-INTERVAL '1 day',
  'W/"task-C01"', '{}', NOW(), NULL),

('550e8400-e29b-41d4-a716-446655440000','task-C02','plan-CLOUD-Q2','bkt-CLOUD-todo',
  'Review và tối ưu chi phí AWS Reserved Instances',
  0, 1, NOW() + INTERVAL '13 days',
  ARRAY[]::text[], 'mgr-001', NOW()-INTERVAL '5 days', 'mgr-001', NOW()-INTERVAL '5 days',
  'W/"task-C02"', '{}', NOW(), NULL),

('550e8400-e29b-41d4-a716-446655440000','task-C03','plan-CLOUD-Q2','bkt-CLOUD-backlog',
  'Setup Terraform remote backend S3 và chuẩn hóa module structure',
  0, 5, NOW() + INTERVAL '27 days',
  ARRAY[]::text[], 'inf-001', NOW()-INTERVAL '7 days', 'inf-001', NOW()-INTERVAL '7 days',
  'W/"task-C03"', '{}', NOW(), NULL),

-- BLOCKED: last_modified_at_graph 5 days ago, percent_complete=40
('550e8400-e29b-41d4-a716-446655440000','task-C04','plan-CLOUD-Q2','bkt-CLOUD-progress',
  'Migration PostgreSQL production sang AWS RDS Multi-AZ',
  40, 1, NOW() + INTERVAL '11 days',
  ARRAY['inf-002']::text[], 'mgr-001', NOW()-INTERVAL '12 days', 'inf-002', NOW()-INTERVAL '5 days',
  'W/"task-C04"', '{}', NOW(), NULL),

('550e8400-e29b-41d4-a716-446655440000','task-C05','plan-CLOUD-Q2','bkt-CLOUD-done',
  'Setup CloudFront CDN và cấu hình cache policy cho static assets',
  100, 5, NOW()-INTERVAL '7 days',
  ARRAY['inf-004']::text[], 'mgr-001', NOW()-INTERVAL '27 days', 'inf-004', NOW()-INTERVAL '9 days',
  'W/"task-C05"', '{}', NOW(), NULL),

-- ── plan-OPS-2026 ─────────────────────────────────────────────────────────────
('550e8400-e29b-41d4-a716-446655440000','task-O01','plan-OPS-2026','bkt-OPS-todo',
  'Kiểm tra và cải thiện bảo mật CI/CD pipeline secrets management',
  0, 1, NOW() + INTERVAL '8 days',
  ARRAY['inf-004']::text[], 'mgr-001', NOW()-INTERVAL '3 days', 'inf-004', NOW()-INTERVAL '3 days',
  'W/"task-O01"', '{}', NOW(), NULL),

-- BLOCKED: last_modified_at_graph 5 days ago, percent_complete=30
('550e8400-e29b-41d4-a716-446655440000','task-O02','plan-OPS-2026','bkt-OPS-progress',
  'Triển khai ELK stack cho centralized log aggregation',
  30, 1, NOW() + INTERVAL '2 days',
  ARRAY['inf-006']::text[], 'mgr-001', NOW()-INTERVAL '15 days', 'inf-006', NOW()-INTERVAL '5 days',
  'W/"task-O02"', '{}', NOW(), NULL),

('550e8400-e29b-41d4-a716-446655440000','task-O03','plan-OPS-2026','bkt-OPS-backlog',
  'Audit Terraform state management và chuẩn hóa remote backend',
  0, 5, NOW() + INTERVAL '22 days',
  ARRAY[]::text[], 'mgr-001', NOW()-INTERVAL '9 days', 'mgr-001', NOW()-INTERVAL '9 days',
  'W/"task-O03"', '{}', NOW(), NULL),

('550e8400-e29b-41d4-a716-446655440000','task-O04','plan-OPS-2026','bkt-OPS-backlog',
  'Lên kế hoạch disaster recovery cho production database',
  0, 0, NOW() + INTERVAL '3 days',
  ARRAY[]::text[], 'mgr-001', NOW()-INTERVAL '2 days', 'mgr-001', NOW()-INTERVAL '2 days',
  'W/"task-O04"', '{}', NOW(), NULL),

('550e8400-e29b-41d4-a716-446655440000','task-O05','plan-OPS-2026','bkt-OPS-done',
  'Configure SSL/TLS auto-renewal cho tất cả public domains',
  100, 1, NOW()-INTERVAL '9 days',
  ARRAY['inf-004']::text[], 'mgr-001', NOW()-INTERVAL '20 days', 'inf-004', NOW()-INTERVAL '10 days',
  'W/"task-O05"', '{}', NOW(), NULL),

-- ── plan-SEC-Q2 ───────────────────────────────────────────────────────────────
('550e8400-e29b-41d4-a716-446655440000','task-S01','plan-SEC-Q2','bkt-SEC-todo',
  'Audit Azure AD sign-in logs và phát hiện hành vi đăng nhập bất thường',
  0, 1, NOW() + INTERVAL '7 days',
  ARRAY['sec-002']::text[], 'mgr-002', NOW()-INTERVAL '3 days', 'sec-002', NOW()-INTERVAL '3 days',
  'W/"task-S01"', '{}', NOW(), NULL),

('550e8400-e29b-41d4-a716-446655440000','task-S02','plan-SEC-Q2','bkt-SEC-todo',
  'Review chính sách OAuth 2.0 token expiry và refresh token rotation',
  0, 0, NOW() + INTERVAL '4 days',
  ARRAY[]::text[], 'mgr-002', NOW()-INTERVAL '2 days', 'mgr-002', NOW()-INTERVAL '2 days',
  'W/"task-S02"', '{}', NOW(), NULL),

('550e8400-e29b-41d4-a716-446655440000','task-S03','plan-SEC-Q2','bkt-SEC-progress',
  'Triển khai MFA bắt buộc cho tất cả tài khoản admin và privileged users',
  75, 0, NOW() + INTERVAL '3 days',
  ARRAY['sec-001']::text[], 'mgr-002', NOW()-INTERVAL '14 days', 'sec-001', NOW()-INTERVAL '1 day',
  'W/"task-S03"', '{}', NOW(), NULL),

('550e8400-e29b-41d4-a716-446655440000','task-S04','plan-SEC-Q2','bkt-SEC-backlog',
  'Review mã hóa dữ liệu at-rest trên tất cả các tầng storage',
  0, 1, NOW() + INTERVAL '12 days',
  ARRAY[]::text[], 'mgr-002', NOW()-INTERVAL '6 days', 'mgr-002', NOW()-INTERVAL '6 days',
  'W/"task-S04"', '{}', NOW(), NULL),

('550e8400-e29b-41d4-a716-446655440000','task-S05','plan-SEC-Q2','bkt-SEC-done',
  'Enable Row-Level Security trên toàn bộ database tables',
  100, 0, NOW()-INTERVAL '8 days',
  ARRAY['sec-001','sec-002']::text[], 'mgr-002', NOW()-INTERVAL '25 days', 'sec-002', NOW()-INTERVAL '9 days',
  'W/"task-S05"', '{}', NOW(), NULL),

-- ── plan-PENTEST-2026 ─────────────────────────────────────────────────────────
-- BLOCKED: last_modified_at_graph 4 days ago, percent_complete=40
('550e8400-e29b-41d4-a716-446655440000','task-P01','plan-PENTEST-2026','bkt-PENTEST-progress',
  'Penetration testing API gateway và các authentication endpoints',
  40, 1, NOW() + INTERVAL '1 day',
  ARRAY['sec-001']::text[], 'mgr-002', NOW()-INTERVAL '12 days', 'sec-001', NOW()-INTERVAL '4 days',
  'W/"task-P01"', '{}', NOW(), NULL),

('550e8400-e29b-41d4-a716-446655440000','task-P02','plan-PENTEST-2026','bkt-PENTEST-todo',
  'Audit firewall rules và network perimeter security',
  0, 0, NOW() + INTERVAL '3 days',
  ARRAY[]::text[], 'mgr-002', NOW()-INTERVAL '1 day', 'mgr-002', NOW()-INTERVAL '1 day',
  'W/"task-P02"', '{}', NOW(), NULL),

('550e8400-e29b-41d4-a716-446655440000','task-P03','plan-PENTEST-2026','bkt-PENTEST-todo',
  'OWASP Top 10 vulnerability scan cho web application và APIs',
  0, 1, NOW() + INTERVAL '13 days',
  ARRAY['sec-004']::text[], 'mgr-002', NOW()-INTERVAL '6 days', 'sec-004', NOW()-INTERVAL '6 days',
  'W/"task-P03"', '{}', NOW(), NULL),

('550e8400-e29b-41d4-a716-446655440000','task-P04','plan-PENTEST-2026','bkt-PENTEST-backlog',
  'Review API security: rate limiting và injection vulnerabilities',
  0, 1, NOW() + INTERVAL '20 days',
  ARRAY[]::text[], 'mgr-002', NOW()-INTERVAL '9 days', 'mgr-002', NOW()-INTERVAL '9 days',
  'W/"task-P04"', '{}', NOW(), NULL),

('550e8400-e29b-41d4-a716-446655440000','task-P05','plan-PENTEST-2026','bkt-PENTEST-done',
  'Social engineering awareness test và phishing simulation campaign',
  100, 5, NOW()-INTERVAL '5 days',
  ARRAY['sec-003']::text[], 'mgr-002', NOW()-INTERVAL '24 days', 'sec-003', NOW()-INTERVAL '6 days',
  'W/"task-P05"', '{}', NOW(), NULL),

-- ── plan-PROD-Q2 ──────────────────────────────────────────────────────────────
('550e8400-e29b-41d4-a716-446655440000','task-PD01','plan-PROD-Q2','bkt-PROD-todo',
  'Phát triển tính năng export báo cáo dạng PDF cho manager',
  0, 1, NOW() + INTERVAL '17 days',
  ARRAY[]::text[], 'mgr-003', NOW()-INTERVAL '9 days', 'mgr-003', NOW()-INTERVAL '9 days',
  'W/"task-PD01"', '{}', NOW(), NULL),

('550e8400-e29b-41d4-a716-446655440000','task-PD02','plan-PROD-Q2','bkt-PROD-todo',
  'Cải thiện UX trang dashboard: thêm filter và search nâng cao',
  0, 5, NOW() + INTERVAL '22 days',
  ARRAY[]::text[], 'mgr-003', NOW()-INTERVAL '11 days', 'mgr-003', NOW()-INTERVAL '11 days',
  'W/"task-PD02"', '{}', NOW(), NULL),

('550e8400-e29b-41d4-a716-446655440000','task-PD03','plan-PROD-Q2','bkt-PROD-progress',
  'Fix bug hiển thị sai số trang khi filter danh sách task',
  60, 1, NOW() + INTERVAL '2 days',
  ARRAY['prd-001']::text[], 'prd-001', NOW()-INTERVAL '7 days', 'prd-001', NOW()-INTERVAL '1 day',
  'W/"task-PD03"', '{}', NOW(), NULL),

('550e8400-e29b-41d4-a716-446655440000','task-PD04','plan-PROD-Q2','bkt-PROD-backlog',
  'Tích hợp webhook Microsoft Teams để gửi notifications',
  0, 5, NOW() + INTERVAL '32 days',
  ARRAY[]::text[], 'mgr-003', NOW()-INTERVAL '14 days', 'mgr-003', NOW()-INTERVAL '14 days',
  'W/"task-PD04"', '{}', NOW(), NULL),

('550e8400-e29b-41d4-a716-446655440000','task-PD05','plan-PROD-Q2','bkt-PROD-done',
  'Hoàn thiện tính năng đăng nhập SSO với Azure AD',
  100, 0, NOW()-INTERVAL '9 days',
  ARRAY['prd-003']::text[], 'mgr-003', NOW()-INTERVAL '29 days', 'prd-003', NOW()-INTERVAL '10 days',
  'W/"task-PD05"', '{}', NOW(), NULL),

-- ── plan-API-Q2 ───────────────────────────────────────────────────────────────
('550e8400-e29b-41d4-a716-446655440000','task-A01','plan-API-Q2','bkt-API-done',
  'Xây dựng API endpoint lấy danh sách task theo plan và bucket',
  100, 1, NOW()-INTERVAL '6 days',
  ARRAY['prd-001']::text[], 'prd-001', NOW()-INTERVAL '21 days', 'prd-001', NOW()-INTERVAL '7 days',
  'W/"task-A01"', '{}', NOW(), NULL),

-- BLOCKED: last_modified_at_graph 5 days ago, percent_complete=55
('550e8400-e29b-41d4-a716-446655440000','task-A02','plan-API-Q2','bkt-API-progress',
  'Thiết kế và implement API rate limiting middleware',
  55, 1, NOW() + INTERVAL '6 days',
  ARRAY['prd-003']::text[], 'mgr-003', NOW()-INTERVAL '13 days', 'prd-003', NOW()-INTERVAL '5 days',
  'W/"task-A02"', '{}', NOW(), NULL),

('550e8400-e29b-41d4-a716-446655440000','task-A03','plan-API-Q2','bkt-API-todo',
  'Thêm OpenAPI documentation đầy đủ cho tất cả endpoints',
  0, 5, NOW() + INTERVAL '17 days',
  ARRAY['prd-001']::text[], 'mgr-003', NOW()-INTERVAL '4 days', 'mgr-003', NOW()-INTERVAL '4 days',
  'W/"task-A03"', '{}', NOW(), NULL),

('550e8400-e29b-41d4-a716-446655440000','task-A04','plan-API-Q2','bkt-API-progress',
  'Setup API Gateway với JWT authentication middleware',
  70, 0, NOW() + INTERVAL '6 days',
  ARRAY['prd-004']::text[], 'mgr-003', NOW()-INTERVAL '11 days', 'prd-004', NOW()-INTERVAL '1 day',
  'W/"task-A04"', '{}', NOW(), NULL),

('550e8400-e29b-41d4-a716-446655440000','task-A05','plan-API-Q2','bkt-API-backlog',
  'Implement GraphQL endpoint cho mobile clients',
  0, 9, NOW() + INTERVAL '42 days',
  ARRAY[]::text[], 'mgr-003', NOW()-INTERVAL '12 days', 'mgr-003', NOW()-INTERVAL '12 days',
  'W/"task-A05"', '{}', NOW(), NULL),

-- ── plan-MAINT-Q2 ─────────────────────────────────────────────────────────────
('550e8400-e29b-41d4-a716-446655440000','task-M01','plan-MAINT-Q2','bkt-MAINT-todo',
  'Upgrade Node.js 20 LTS lên Node.js 22 cho toàn bộ services',
  0, 5, NOW() + INTERVAL '13 days',
  ARRAY['prd-001']::text[], 'mgr-003', NOW()-INTERVAL '4 days', 'prd-001', NOW()-INTERVAL '4 days',
  'W/"task-M01"', '{}', NOW(), NULL),

('550e8400-e29b-41d4-a716-446655440000','task-M02','plan-MAINT-Q2','bkt-MAINT-backlog',
  'Upgrade PostgreSQL 15 lên 16 production cluster',
  0, 1, NOW() + INTERVAL '27 days',
  ARRAY['prd-004']::text[], 'mgr-003', NOW()-INTERVAL '7 days', 'mgr-003', NOW()-INTERVAL '7 days',
  'W/"task-M02"', '{}', NOW(), NULL),

('550e8400-e29b-41d4-a716-446655440000','task-M03','plan-MAINT-Q2','bkt-MAINT-progress',
  'Thêm dark mode cho toàn bộ Studio application',
  35, 9, NOW() + INTERVAL '27 days',
  ARRAY['prd-002']::text[], 'prd-002', NOW()-INTERVAL '6 days', 'prd-002', NOW()-INTERVAL '2 days',
  'W/"task-M03"', '{}', NOW(), NULL),

('550e8400-e29b-41d4-a716-446655440000','task-M04','plan-MAINT-Q2','bkt-MAINT-todo',
  'Cleanup stale Docker images và deprecated containers',
  0, 9, NOW() + INTERVAL '17 days',
  ARRAY[]::text[], 'mgr-003', NOW()-INTERVAL '3 days', 'mgr-003', NOW()-INTERVAL '3 days',
  'W/"task-M04"', '{}', NOW(), NULL),

('550e8400-e29b-41d4-a716-446655440000','task-M05','plan-MAINT-Q2','bkt-MAINT-done',
  'Setup database connection pooling với PgBouncer',
  100, 1, NOW()-INTERVAL '7 days',
  ARRAY['prd-004']::text[], 'mgr-003', NOW()-INTERVAL '24 days', 'prd-004', NOW()-INTERVAL '8 days',
  'W/"task-M05"', '{}', NOW(), NULL)

ON CONFLICT (tenant_id, graph_task_id) DO UPDATE
  SET title                  = EXCLUDED.title,
      percent_complete       = EXCLUDED.percent_complete,
      priority               = EXCLUDED.priority,
      due_date               = EXCLUDED.due_date,
      assignee_ids           = EXCLUDED.assignee_ids,
      last_modified_by       = EXCLUDED.last_modified_by,
      last_modified_at_graph = EXCLUDED.last_modified_at_graph,
      synced_at              = EXCLUDED.synced_at;

-- ─── Task Details ─────────────────────────────────────────────────────────────
-- Rich Vietnamese descriptions so Agent can classify domain from keywords:
--   Infrastructure: kubernetes, docker, AWS, EKS, Terraform, networking, Prometheus
--   Security:       OAuth, audit, penetration-testing, firewall, OWASP, MFA, IAM
--   Product:        react, typescript, UI, PDF, dashboard, API, PostgreSQL

INSERT INTO connector_ms365_planner.planner_task_details_cache
  (tenant_id, graph_task_id, description, checklist, references, etag, raw, synced_at)
VALUES

('550e8400-e29b-41d4-a716-446655440000','task-I01',
  'HPA hiện tại dùng cấu hình mặc định (min=1, max=10, targetCPU=80%). Sau một số sự cố traffic spike làm crash node, team cần review lại toàn bộ autoscaling policy của Kubernetes cluster production trên GKE. Cần kiểm tra cả cluster-autoscaler và HPA, đánh giá xem KEDA có phù hợp không, và chuẩn hóa resource requests/limits của tất cả deployments.',
  '[{"id":"cl-I01-1","title":"Kiểm tra cấu hình HPA hiện tại trên từng namespace","isChecked":false},{"id":"cl-I01-2","title":"Đánh giá cluster-autoscaler node pool settings","isChecked":false},{"id":"cl-I01-3","title":"Review resource requests/limits của tất cả deployments","isChecked":false},{"id":"cl-I01-4","title":"Đánh giá KEDA cho event-driven autoscaling","isChecked":false},{"id":"cl-I01-5","title":"Áp dụng cấu hình mới và viết ADR","isChecked":false}]',
  NULL, 'W/"d-I01"', '{}', NOW()),

('550e8400-e29b-41d4-a716-446655440000','task-I02',
  'Sau đợt review Q1, phát hiện một số IAM roles trong AWS accounts (prod, staging, dev) có wildcard permissions (*) và nhiều service accounts không còn dùng nhưng vẫn active. Cần audit toàn bộ IAM roles, loại bỏ over-privileged permissions theo nguyên tắc least privilege, và xóa các stale accounts.',
  '[{"id":"cl-I02-1","title":"Export toàn bộ IAM roles từ 3 AWS accounts","isChecked":false},{"id":"cl-I02-2","title":"Identify roles có wildcard (*) permissions","isChecked":false},{"id":"cl-I02-3","title":"Kiểm tra unused roles không dùng hơn 90 ngày","isChecked":false},{"id":"cl-I02-4","title":"Restrict hoặc xóa các vi phạm least privilege","isChecked":false},{"id":"cl-I02-5","title":"Tạo báo cáo audit và gửi lên team lead","isChecked":false}]',
  NULL, 'W/"d-I02"', '{}', NOW()),

('550e8400-e29b-41d4-a716-446655440000','task-I03',
  'VPC production hiện có subnet design từ 2024, chưa được review lại sau khi hệ thống scale lên. Một số services đang chạy trong public subnet không cần thiết. Cần review toàn bộ network segmentation, routing tables, security groups, và NACLs để đảm bảo traffic flow đúng và phân vùng mạng hợp lý.',
  '[{"id":"cl-I03-1","title":"Vẽ lại network diagram hiện tại","isChecked":false},{"id":"cl-I03-2","title":"Identify services đang chạy sai subnet","isChecked":false},{"id":"cl-I03-3","title":"Review security groups và NACLs","isChecked":false},{"id":"cl-I03-4","title":"Review routing tables và VPC peering","isChecked":false},{"id":"cl-I03-5","title":"Đề xuất và áp dụng network redesign","isChecked":false}]',
  NULL, 'W/"d-I03"', '{}', NOW()),

('550e8400-e29b-41d4-a716-446655440000','task-I04',
  'Team cần setup Grafana dashboard tập trung để monitor tất cả microservices: CPU, memory, request rate, error rate, và latency. Hiện tại mỗi service đang có metrics riêng lẻ, không có view tổng hợp. Prometheus đã được cài trên Kubernetes cluster nhưng chưa có dashboard chuẩn và alert rules.',
  '[{"id":"cl-I04-1","title":"Review Prometheus scrape config hiện tại","isChecked":true},{"id":"cl-I04-2","title":"Thiết kế dashboard layout cho service overview","isChecked":true},{"id":"cl-I04-3","title":"Tạo dashboard cho từng microservice","isChecked":false},{"id":"cl-I04-4","title":"Setup alert rules cho SLO violations","isChecked":false}]',
  NULL, 'W/"d-I04"', '{}', NOW()),

('550e8400-e29b-41d4-a716-446655440000','task-I05',
  'Đã hoàn thành cấu hình Kubernetes RBAC với các ClusterRole và RoleBinding theo nguyên tắc least privilege. Network policies đã được áp dụng để kiểm soát east-west traffic giữa các namespaces trong cluster production. Tất cả service accounts đã được gán đúng permissions.',
  '[{"id":"cl-I05-1","title":"Thiết kế RBAC model theo namespace","isChecked":true},{"id":"cl-I05-2","title":"Tạo ClusterRole và RoleBinding cho từng team","isChecked":true},{"id":"cl-I05-3","title":"Apply network policies cho east-west traffic","isChecked":true},{"id":"cl-I05-4","title":"Audit và verify permissions","isChecked":true}]',
  NULL, 'W/"d-I05"', '{}', NOW()),

('550e8400-e29b-41d4-a716-446655440000','task-C01',
  'Còn 5 services legacy viết bằng PHP 7.4 đang chạy trực tiếp trên EC2, không có container. Cần Dockerize từng service, đảm bảo hoạt động đúng trong container environment, sau đó migrate lên EKS. Phải đảm bảo zero-downtime với chiến lược canary deployment. Bắt đầu với 2 services ít phụ thuộc nhất.',
  '[{"id":"cl-C01-1","title":"Liệt kê và phân tích 5 services PHP cần migrate","isChecked":true},{"id":"cl-C01-2","title":"Viết Dockerfile cho service đầu tiên","isChecked":false},{"id":"cl-C01-3","title":"Test container build và runtime","isChecked":false},{"id":"cl-C01-4","title":"Deploy lên EKS với canary strategy","isChecked":false}]',
  NULL, 'W/"d-C01"', '{}', NOW()),

('550e8400-e29b-41d4-a716-446655440000','task-C02',
  'Chi phí AWS đang tăng cao trong Q1, phần lớn là EC2 On-Demand instances. Cần review toàn bộ usage và đề xuất chuyển sang Reserved Instances hoặc Savings Plans để tiết kiệm 30-40%. Ngoài ra cần identify các resources chưa dùng: idle EBS volumes, unattached Elastic IPs, unused Load Balancers.',
  '[{"id":"cl-C02-1","title":"Export AWS Cost Explorer report 3 tháng gần đây","isChecked":false},{"id":"cl-C02-2","title":"Identify EC2 instances có thể chuyển sang Reserved","isChecked":false},{"id":"cl-C02-3","title":"Audit unused resources (EBS, EIP, LB)","isChecked":false},{"id":"cl-C02-4","title":"Trình bày savings plan và lấy approval","isChecked":false}]',
  NULL, 'W/"d-C02"', '{}', NOW()),

('550e8400-e29b-41d4-a716-446655440000','task-C03',
  'Terraform state hiện đang được lưu locally trên máy của một số engineers, không có remote backend thống nhất. Điều này gây rủi ro state corruption khi nhiều người apply cùng lúc. Cần migrate state về S3 + DynamoDB locking, chuẩn hóa terraform module structure, và setup CI/CD pipeline cho Terraform.',
  '[{"id":"cl-C03-1","title":"Liệt kê tất cả Terraform workspaces và state locations","isChecked":false},{"id":"cl-C03-2","title":"Setup S3 bucket + DynamoDB cho remote state","isChecked":false},{"id":"cl-C03-3","title":"Migrate local states lên remote backend","isChecked":false},{"id":"cl-C03-4","title":"Chuẩn hóa module structure và naming convention","isChecked":false}]',
  NULL, 'W/"d-C03"', '{}', NOW()),

('550e8400-e29b-41d4-a716-446655440000','task-C04',
  'PostgreSQL production hiện chạy trên EC2 self-managed. Team muốn migrate sang AWS RDS Multi-AZ để có high availability tự động và managed backups. Task đang bị block do chờ VPC peering setup giữa hai regions. Database size ~500GB, cần zero-downtime migration strategy với logical replication.',
  '[{"id":"cl-C04-1","title":"Setup VPC peering và network route","isChecked":false},{"id":"cl-C04-2","title":"Provision RDS Multi-AZ instance","isChecked":false},{"id":"cl-C04-3","title":"Setup logical replication để sync data","isChecked":false},{"id":"cl-C04-4","title":"Cutover với minimal downtime","isChecked":false}]',
  NULL, 'W/"d-C04"', '{}', NOW()),

('550e8400-e29b-41d4-a716-446655440000','task-C05',
  'Đã hoàn thành setup CloudFront distribution cho tất cả static assets của ứng dụng. Cache policy được cấu hình với TTL phù hợp theo loại file. Kết quả: load time giảm 60% cho users tại khu vực Đông Nam Á, bandwidth costs giảm 40%.',
  '[{"id":"cl-C05-1","title":"Tạo CloudFront distribution và origins","isChecked":true},{"id":"cl-C05-2","title":"Cấu hình cache behaviors và TTL","isChecked":true},{"id":"cl-C05-3","title":"Setup custom domain và SSL certificate","isChecked":true},{"id":"cl-C05-4","title":"Test và measure performance improvement","isChecked":true}]',
  NULL, 'W/"d-C05"', '{}', NOW()),

('550e8400-e29b-41d4-a716-446655440000','task-O01',
  'Một số GitHub Actions workflows đang lưu secrets không đúng cách: dùng plaintext env vars trong YAML file, một số secrets được hardcode trực tiếp trong Dockerfile. Cần audit toàn bộ CI/CD pipeline, migrate sang GitHub Secrets + AWS Secrets Manager, và thiết lập quy trình quản lý secrets chuẩn cho DevOps team.',
  '[{"id":"cl-O01-1","title":"Audit tất cả workflow YAML files tìm plaintext secrets","isChecked":false},{"id":"cl-O01-2","title":"Kiểm tra Dockerfile và build scripts","isChecked":false},{"id":"cl-O01-3","title":"Migrate sang GitHub Secrets và AWS Secrets Manager","isChecked":false},{"id":"cl-O01-4","title":"Viết hướng dẫn secrets management cho team","isChecked":false}]',
  NULL, 'W/"d-O01"', '{}', NOW()),

('550e8400-e29b-41d4-a716-446655440000','task-O02',
  'Hệ thống hiện chưa có centralized logging. Mỗi service ghi log theo format riêng, lưu local trên container. Khi debug cross-service issues phải SSH vào từng pod. Task đang bị block vì Elasticsearch cluster chưa có đủ storage capacity trên Kubernetes. Cần setup ELK hoặc EFK stack cho log aggregation.',
  '[{"id":"cl-O02-1","title":"Chọn stack: ELK vs EFK vs Loki","isChecked":true},{"id":"cl-O02-2","title":"Provision storage cho Elasticsearch cluster","isChecked":false},{"id":"cl-O02-3","title":"Cấu hình Logstash/Fluentd collect logs từ pods","isChecked":false},{"id":"cl-O02-4","title":"Tạo Kibana dashboards cho log analysis","isChecked":false}]',
  NULL, 'W/"d-O02"', '{}', NOW()),

('550e8400-e29b-41d4-a716-446655440000','task-O03',
  'Cần audit toàn bộ Terraform workspaces và đảm bảo remote state được lưu đúng cách. Hiện có một số modules dùng local backend gây rủi ro cho team. Cần chuẩn hóa module naming convention và tạo CI/CD pipeline cho Terraform với plan/apply workflow.',
  '[{"id":"cl-O03-1","title":"Liệt kê tất cả Terraform repos và workspaces","isChecked":false},{"id":"cl-O03-2","title":"Verify remote backend configuration","isChecked":false},{"id":"cl-O03-3","title":"Chuẩn hóa naming convention","isChecked":false},{"id":"cl-O03-4","title":"Setup Terraform CI/CD pipeline","isChecked":false}]',
  NULL, 'W/"d-O03"', '{}', NOW()),

('550e8400-e29b-41d4-a716-446655440000','task-O04',
  'Chưa có disaster recovery plan chính thức cho production database. Trong trường hợp primary region (ap-southeast-1) bị outage, không có quy trình rõ ràng để failover. Cần lên kế hoạch DR đầy đủ: kiến trúc multi-region, runbook failover step-by-step, và RTO/RPO targets được approve bởi stakeholders.',
  '[{"id":"cl-O04-1","title":"Document database architecture và dependencies","isChecked":false},{"id":"cl-O04-2","title":"Xác định failure scenarios và impact","isChecked":false},{"id":"cl-O04-3","title":"Thiết kế DR architecture Multi-region","isChecked":false},{"id":"cl-O04-4","title":"Viết runbook failover và lấy approval","isChecked":false}]',
  NULL, 'W/"d-O04"', '{}', NOW()),

('550e8400-e29b-41d4-a716-446655440000','task-O05',
  'Đã hoàn thành setup auto-renewal SSL/TLS certificates cho tất cả public domains sử dụng Let''s Encrypt và cert-manager trên Kubernetes. Certificates tự động renew 30 ngày trước khi hết hạn. Monitoring alert được setup khi cert còn dưới 14 ngày.',
  '[{"id":"cl-O05-1","title":"Cài cert-manager trên Kubernetes cluster","isChecked":true},{"id":"cl-O05-2","title":"Cấu hình ClusterIssuer với Let Encrypt","isChecked":true},{"id":"cl-O05-3","title":"Apply Certificate resources cho tất cả domains","isChecked":true},{"id":"cl-O05-4","title":"Setup monitoring alert cho cert expiry","isChecked":true}]',
  NULL, 'W/"d-O05"', '{}', NOW()),

('550e8400-e29b-41d4-a716-446655440000','task-S01',
  'Azure AD sign-in logs gần đây có một số entries bất thường: đăng nhập từ IP ngoài Việt Nam vào lúc nửa đêm cho một số tài khoản. Cần audit logs 30 ngày gần nhất, xác định các hành vi đáng ngờ, thiết lập Conditional Access Policy, và tạo alerting rule trong Azure Monitor.',
  '[{"id":"cl-S01-1","title":"Export Azure AD sign-in logs 30 ngày","isChecked":false},{"id":"cl-S01-2","title":"Identify đăng nhập từ IP/location bất thường","isChecked":false},{"id":"cl-S01-3","title":"Setup Conditional Access Policy cho IP không tin cậy","isChecked":false},{"id":"cl-S01-4","title":"Tạo alert rule trong Azure Monitor","isChecked":false}]',
  NULL, 'W/"d-S01"', '{}', NOW()),

('550e8400-e29b-41d4-a716-446655440000','task-S02',
  'Access tokens hiện có TTL 1 giờ, refresh tokens 30 ngày và không có rotation. Theo OWASP OAuth 2.0 Security Best Current Practices, cần có refresh token rotation và revocation mechanism. Cần review toàn bộ OAuth config trong @seta/oauth module và cập nhật policy phù hợp với security requirements.',
  '[{"id":"cl-S02-1","title":"Audit OAuth config trong @seta/oauth module","isChecked":false},{"id":"cl-S02-2","title":"Review token storage và transmission security","isChecked":false},{"id":"cl-S02-3","title":"Kiểm tra refresh token rotation implementation","isChecked":false},{"id":"cl-S02-4","title":"So sánh với OWASP OAuth 2.0 BCP và cập nhật","isChecked":false}]',
  NULL, 'W/"d-S02"', '{}', NOW()),

('550e8400-e29b-41d4-a716-446655440000','task-S03',
  'Sau yêu cầu từ security audit Q1, cần bật MFA bắt buộc cho tất cả tài khoản admin và privileged users. Áp dụng cho cả Azure AD admin accounts, AWS IAM users có console access, và tài khoản superadmin trong seta-os. Đang ở giai đoạn cuối: verify enforcement và test edge cases.',
  '[{"id":"cl-S03-1","title":"Identify tất cả tài khoản admin cần enforce MFA","isChecked":true},{"id":"cl-S03-2","title":"Enable MFA trong Azure AD Conditional Access","isChecked":true},{"id":"cl-S03-3","title":"Enable MFA cho AWS IAM console users","isChecked":true},{"id":"cl-S03-4","title":"Verify và test MFA enforcement toàn bộ","isChecked":false}]',
  NULL, 'W/"d-S03"', '{}', NOW()),

('550e8400-e29b-41d4-a716-446655440000','task-S04',
  'Dữ liệu trong PostgreSQL, S3 buckets và Redis cache hiện chưa có policy mã hóa thống nhất. Một số S3 buckets chưa bật server-side encryption. Cần review toàn bộ data at-rest encryption trên mọi tầng storage và đảm bảo tuân thủ compliance requirements theo tiêu chuẩn SOC 2.',
  '[{"id":"cl-S04-1","title":"Kiểm tra PostgreSQL: pg_crypto và TDE configuration","isChecked":false},{"id":"cl-S04-2","title":"Audit S3 buckets: server-side encryption status","isChecked":false},{"id":"cl-S04-3","title":"Review Redis encryption at-rest settings","isChecked":false},{"id":"cl-S04-4","title":"Kiểm tra AWS KMS key rotation policy","isChecked":false}]',
  NULL, 'W/"d-S04"', '{}', NOW()),

('550e8400-e29b-41d4-a716-446655440000','task-S05',
  'Đã hoàn thành enable Row-Level Security trên toàn bộ tenant-data tables trong PostgreSQL. RLS policies được áp dụng cho tất cả tables thuộc các schemas của connectors và products. Đã verify tenant isolation bằng integration tests với multiple tenants. Security audit đã xác nhận không có cross-tenant data leak.',
  '[{"id":"cl-S05-1","title":"Thiết kế RLS policy template cho mỗi schema","isChecked":true},{"id":"cl-S05-2","title":"Apply RLS cho tất cả tenant-data tables","isChecked":true},{"id":"cl-S05-3","title":"Viết integration tests verify isolation","isChecked":true},{"id":"cl-S05-4","title":"Security audit sign-off","isChecked":true}]',
  NULL, 'W/"d-S05"', '{}', NOW()),

('550e8400-e29b-41d4-a716-446655440000','task-P01',
  'Cần thực hiện penetration testing cho API gateway và các authentication endpoints (login, token refresh, logout). Mục tiêu: phát hiện OWASP Top 10 vulnerabilities trước khi go-live với enterprise customers. Task đang bị block do chờ isolated staging environment setup hoàn tất.',
  '[{"id":"cl-P01-1","title":"Setup isolated staging environment cho pentest","isChecked":true},{"id":"cl-P01-2","title":"Pentest authentication endpoints (login, OAuth flow)","isChecked":false},{"id":"cl-P01-3","title":"Pentest API endpoints: injection, auth bypass","isChecked":false},{"id":"cl-P01-4","title":"Lập báo cáo findings và remediation plan","isChecked":false}]',
  NULL, 'W/"d-P01"', '{}', NOW()),

('550e8400-e29b-41d4-a716-446655440000','task-P02',
  'Firewall rules production chưa được review từ Q4 2025. Một số rules cũ còn tồn tại từ thời dev và có dạng any-any (0.0.0.0/0). Cần rà soát toàn bộ ingress/egress firewall rules, loại bỏ overly permissive entries, đảm bảo east-west traffic giữa các network segments được kiểm soát chặt chẽ.',
  '[{"id":"cl-P02-1","title":"Export toàn bộ firewall rules hiện tại","isChecked":false},{"id":"cl-P02-2","title":"Identify any-any và overly permissive rules","isChecked":false},{"id":"cl-P02-3","title":"Review inbound rules từ internet","isChecked":false},{"id":"cl-P02-4","title":"Apply least privilege và document thay đổi","isChecked":false}]',
  NULL, 'W/"d-P02"', '{}', NOW()),

('550e8400-e29b-41d4-a716-446655440000','task-P03',
  'Cần thực hiện OWASP Top 10 vulnerability scan toàn diện cho web application và REST APIs: SQL injection, XSS, CSRF, broken authentication, security misconfiguration. Sử dụng OWASP ZAP và manual testing. Kết quả cần được document và prioritize remediation theo severity.',
  '[{"id":"cl-P03-1","title":"Setup OWASP ZAP và configure scan profile","isChecked":false},{"id":"cl-P03-2","title":"Run automated scan cho tất cả endpoints","isChecked":false},{"id":"cl-P03-3","title":"Manual testing cho OWASP Top 10 items","isChecked":false},{"id":"cl-P03-4","title":"Document findings và tạo remediation plan","isChecked":false}]',
  NULL, 'W/"d-P03"', '{}', NOW()),

('550e8400-e29b-41d4-a716-446655440000','task-P04',
  'Cần review toàn bộ API security theo OWASP API Security Top 10: rate limiting chống brute force và DDoS, input validation chống injection attacks, authorization checks đảm bảo không có broken access control. Test tất cả REST endpoints và document vulnerabilities tìm được.',
  '[{"id":"cl-P04-1","title":"Review rate limiting implementation","isChecked":false},{"id":"cl-P04-2","title":"Test input validation và injection prevention","isChecked":false},{"id":"cl-P04-3","title":"Verify authorization checks cho tất cả endpoints","isChecked":false},{"id":"cl-P04-4","title":"Tổng hợp báo cáo và remediation","isChecked":false}]',
  NULL, 'W/"d-P04"', '{}', NOW()),

('550e8400-e29b-41d4-a716-446655440000','task-P05',
  'Đã hoàn thành social engineering awareness test với 3 đợt phishing simulation gửi đến toàn bộ 50 nhân viên trong 4 tuần. Click rate ban đầu 35%, giảm xuống 8% sau training. Kết quả và recommendations đã được gửi đến HR và Management.',
  '[{"id":"cl-P05-1","title":"Thiết kế kịch bản phishing simulation","isChecked":true},{"id":"cl-P05-2","title":"Gửi 3 đợt phishing simulation","isChecked":true},{"id":"cl-P05-3","title":"Tổ chức training cho nhân viên có click rate cao","isChecked":true},{"id":"cl-P05-4","title":"Gửi báo cáo kết quả cho Management","isChecked":true}]',
  NULL, 'W/"d-P05"', '{}', NOW()),

('550e8400-e29b-41d4-a716-446655440000','task-PD01',
  'Managers và team leads đang cần export báo cáo tiến độ task ra PDF để trình bày trong các buổi họp steering committee. Hiện tại chỉ có thể xem trực tuyến trên Studio. Cần xây dựng tính năng PDF generation với template phù hợp bao gồm charts và tables.',
  '[{"id":"cl-PD01-1","title":"Thiết kế template PDF cho báo cáo","isChecked":false},{"id":"cl-PD01-2","title":"Tích hợp thư viện PDF generation","isChecked":false},{"id":"cl-PD01-3","title":"Xây dựng API endpoint export","isChecked":false},{"id":"cl-PD01-4","title":"Thêm nút Export trên UI","isChecked":false}]',
  NULL, 'W/"d-PD01"', '{}', NOW()),

('550e8400-e29b-41d4-a716-446655440000','task-PD02',
  'Trang dashboard hiện có filter cơ bản (theo status). Users phản hồi cần thêm: filter theo assignee, date range, priority, và full-text search trong title. Cần redesign filter component và đảm bảo performance tốt với large datasets trên 1000 tasks.',
  '[{"id":"cl-PD02-1","title":"Thu thập yêu cầu cụ thể từ users","isChecked":false},{"id":"cl-PD02-2","title":"Thiết kế UI cho advanced filter panel","isChecked":false},{"id":"cl-PD02-3","title":"Implement filter logic và search","isChecked":false},{"id":"cl-PD02-4","title":"Test performance với 1000+ tasks","isChecked":false}]',
  NULL, 'W/"d-PD02"', '{}', NOW()),

('550e8400-e29b-41d4-a716-446655440000','task-PD03',
  'Bug: Khi user filter danh sách task theo criteria (status, assignee), pagination không reset về trang 1. Nếu đang ở trang 3 rồi apply filter, UI hiển thị trang 3 nhưng kết quả không đủ items, gây UX tệ. Lỗi này xảy ra ở cả desktop và mobile views.',
  '[{"id":"cl-PD03-1","title":"Reproduce bug và xác định root cause","isChecked":true},{"id":"cl-PD03-2","title":"Fix pagination reset khi filter thay đổi","isChecked":true},{"id":"cl-PD03-3","title":"Test trên desktop và mobile","isChecked":false},{"id":"cl-PD03-4","title":"Regression test toàn bộ pagination flows","isChecked":false}]',
  NULL, 'W/"d-PD03"', '{}', NOW()),

('550e8400-e29b-41d4-a716-446655440000','task-PD04',
  'Product team cần gửi notifications tự động qua Microsoft Teams khi có task được assign, due date sắp đến, hoặc task được completed. Cần tích hợp Incoming Webhook và cấu hình routing logic để gửi đúng channel.',
  '[{"id":"cl-PD04-1","title":"Setup Microsoft Teams Incoming Webhook","isChecked":false},{"id":"cl-PD04-2","title":"Implement notification triggers","isChecked":false},{"id":"cl-PD04-3","title":"Format message cards theo Teams standard","isChecked":false},{"id":"cl-PD04-4","title":"Test và deploy","isChecked":false}]',
  NULL, 'W/"d-PD04"', '{}', NOW()),

('550e8400-e29b-41d4-a716-446655440000','task-PD05',
  'Đã hoàn thành tích hợp Azure AD SSO cho toàn bộ ứng dụng seta-os. MSAL được cấu hình với admin consent flow. Tất cả users có thể đăng nhập bằng tài khoản Microsoft 365 của tổ chức mà không cần tạo tài khoản riêng. Test đã pass với nhiều tenants.',
  '[{"id":"cl-PD05-1","title":"Cấu hình Azure AD App Registration","isChecked":true},{"id":"cl-PD05-2","title":"Implement MSAL authentication flow","isChecked":true},{"id":"cl-PD05-3","title":"Test với tài khoản Microsoft 365","isChecked":true},{"id":"cl-PD05-4","title":"Document và deploy lên production","isChecked":true}]',
  NULL, 'W/"d-PD05"', '{}', NOW()),

('550e8400-e29b-41d4-a716-446655440000','task-A01',
  'Đã hoàn thành xây dựng API endpoint GET /planner/plans/:planId/tasks để lấy danh sách task. Endpoint hỗ trợ filtering theo bucket, assignee, status với cursor-based pagination. Đã có OpenAPI documentation đầy đủ và integration tests cover happy path và edge cases.',
  '[{"id":"cl-A01-1","title":"Thiết kế API schema và response format","isChecked":true},{"id":"cl-A01-2","title":"Implement endpoint với filters","isChecked":true},{"id":"cl-A01-3","title":"Viết OpenAPI documentation","isChecked":true},{"id":"cl-A01-4","title":"Viết integration tests","isChecked":true}]',
  NULL, 'W/"d-A01"', '{}', NOW()),

('550e8400-e29b-41d4-a716-446655440000','task-A02',
  'Cần implement rate limiting middleware cho tất cả API endpoints để chống brute force và DDoS. Dùng sliding window algorithm với Redis backend. Task đang bị block do Redis cluster chưa được provision trong môi trường staging. Cần coordinate với infrastructure team.',
  '[{"id":"cl-A02-1","title":"Thiết kế rate limiting strategy","isChecked":true},{"id":"cl-A02-2","title":"Provision Redis cluster trong staging","isChecked":false},{"id":"cl-A02-3","title":"Implement sliding window rate limiter","isChecked":false},{"id":"cl-A02-4","title":"Test và deploy","isChecked":false}]',
  NULL, 'W/"d-A02"', '{}', NOW()),

('550e8400-e29b-41d4-a716-446655440000','task-A03',
  'Hiện tại một số API endpoints chưa có OpenAPI documentation đầy đủ. Cần bổ sung schema definitions, request/response examples, và error codes cho tất cả endpoints theo chuẩn OpenAPI 3.1 để hỗ trợ external integrations.',
  '[{"id":"cl-A03-1","title":"Audit endpoints còn thiếu documentation","isChecked":false},{"id":"cl-A03-2","title":"Viết schema definitions cho request/response","isChecked":false},{"id":"cl-A03-3","title":"Thêm examples và error codes","isChecked":false},{"id":"cl-A03-4","title":"Generate và publish OpenAPI spec","isChecked":false}]',
  NULL, 'W/"d-A03"', '{}', NOW()),

('550e8400-e29b-41d4-a716-446655440000','task-A04',
  'Cần setup API Gateway với JWT authentication middleware để validate tokens trước khi route request đến microservices. Middleware cần verify signature, check expiry, validate claims, và inject user context vào downstream headers. Hỗ trợ cả Azure AD tokens và internal service tokens.',
  '[{"id":"cl-A04-1","title":"Thiết kế JWT validation logic","isChecked":true},{"id":"cl-A04-2","title":"Implement middleware với JWKS endpoint","isChecked":true},{"id":"cl-A04-3","title":"Test với Azure AD tokens","isChecked":true},{"id":"cl-A04-4","title":"Deploy và monitor","isChecked":false}]',
  NULL, 'W/"d-A04"', '{}', NOW()),

('550e8400-e29b-41d4-a716-446655440000','task-A05',
  'Mobile team đề xuất thêm GraphQL endpoint để giảm over-fetching và under-fetching. Cần đánh giá feasibility, thiết kế schema theo business domains, và implement server với query complexity limits và depth limiting để tránh abuse.',
  '[{"id":"cl-A05-1","title":"Đánh giá feasibility và chọn GraphQL library","isChecked":false},{"id":"cl-A05-2","title":"Thiết kế schema theo business domains","isChecked":false},{"id":"cl-A05-3","title":"Implement resolvers với complexity limits","isChecked":false},{"id":"cl-A05-4","title":"Test và document","isChecked":false}]',
  NULL, 'W/"d-A05"', '{}', NOW()),

('550e8400-e29b-41d4-a716-446655440000','task-M01',
  'Cần upgrade toàn bộ services từ Node.js 20 LTS lên Node.js 22 LTS. Kiểm tra compatibility của tất cả packages, update Dockerfile base images, test trong staging environment, và rolling update lên production. Node.js 20 LTS sẽ hết support tháng 4/2026.',
  '[{"id":"cl-M01-1","title":"Kiểm tra compatibility của tất cả npm packages","isChecked":false},{"id":"cl-M01-2","title":"Update Dockerfile base images","isChecked":false},{"id":"cl-M01-3","title":"Test toàn bộ services trong staging","isChecked":false},{"id":"cl-M01-4","title":"Rolling update lên production","isChecked":false}]',
  NULL, 'W/"d-M01"', '{}', NOW()),

('550e8400-e29b-41d4-a716-446655440000','task-M02',
  'Cần upgrade PostgreSQL từ version 15 lên 16 cho production cluster. Version 16 có cải tiến về query performance và logical replication. Cần kế hoạch migration zero-downtime với pg_upgrade hoặc logical replication approach, test kỹ trong staging trước.',
  '[{"id":"cl-M02-1","title":"Test pg_upgrade trong staging environment","isChecked":false},{"id":"cl-M02-2","title":"Kiểm tra compatibility extensions và functions","isChecked":false},{"id":"cl-M02-3","title":"Lên kế hoạch maintenance window","isChecked":false},{"id":"cl-M02-4","title":"Execute upgrade và verify","isChecked":false}]',
  NULL, 'W/"d-M02"', '{}', NOW()),

('550e8400-e29b-41d4-a716-446655440000','task-M03',
  'Users đã request dark mode từ lâu. Cần implement dark mode support cho toàn bộ Studio app sử dụng CSS variables và Tailwind dark mode class. Tất cả components cần được test trong cả light và dark mode. Lưu preference của user trong localStorage.',
  '[{"id":"cl-M03-1","title":"Define CSS variables cho dark theme","isChecked":true},{"id":"cl-M03-2","title":"Update Tailwind config cho dark mode","isChecked":true},{"id":"cl-M03-3","title":"Apply dark mode cho tất cả components","isChecked":false},{"id":"cl-M03-4","title":"Test và polish edge cases","isChecked":false}]',
  NULL, 'W/"d-M03"', '{}', NOW()),

('550e8400-e29b-41d4-a716-446655440000','task-M04',
  'Nhiều Docker images cũ đang tồn tại trong registry và local hosts, chiếm dung lượng không cần thiết. Cần thiết lập cleanup policy tự động: xóa images cũ hơn 30 ngày và không được tag, cleanup containers đã stop, và optimize registry storage.',
  '[{"id":"cl-M04-1","title":"Audit dung lượng Docker registry hiện tại","isChecked":false},{"id":"cl-M04-2","title":"Thiết lập lifecycle policy cho registry","isChecked":false},{"id":"cl-M04-3","title":"Cleanup images và containers trên hosts","isChecked":false},{"id":"cl-M04-4","title":"Setup cron job cleanup định kỳ","isChecked":false}]',
  NULL, 'W/"d-M04"', '{}', NOW()),

('550e8400-e29b-41d4-a716-446655440000','task-M05',
  'Đã hoàn thành setup PgBouncer connection pooling cho toàn bộ services kết nối PostgreSQL. Pool mode: transaction. Max pool size: 20 per database. Kết quả: giảm số lượng connections trực tiếp từ hơn 500 xuống còn khoảng 50, PostgreSQL performance cải thiện đáng kể.',
  '[{"id":"cl-M05-1","title":"Cài đặt và cấu hình PgBouncer","isChecked":true},{"id":"cl-M05-2","title":"Cấu hình pool size và timeout","isChecked":true},{"id":"cl-M05-3","title":"Update connection strings các services","isChecked":true},{"id":"cl-M05-4","title":"Monitor và verify performance","isChecked":true}]',
  NULL, 'W/"d-M05"', '{}', NOW())

ON CONFLICT (tenant_id, graph_task_id) DO UPDATE
  SET description = EXCLUDED.description,
      checklist   = EXCLUDED.checklist,
      synced_at   = EXCLUDED.synced_at;

-- ─── How to verify access isolation in integration tests ──────────────────────
--
-- Each manager should see ONLY their team's tasks and plans.
-- Run these queries in separate transactions to verify:
--
-- mgr-001 (Infrastructure) — sees plans INFRA, CLOUD, OPS and all infra team tasks:
--   BEGIN;
--   SELECT set_config('app.tenant_id', '550e8400-e29b-41d4-a716-446655440000', true);
--   SELECT set_config('app.user_id', 'mgr-001', true);
--   SELECT graph_plan_id, title FROM planner.v_visible_plans ORDER BY title;
--   -- Expected: plan-INFRA-2026, plan-CLOUD-Q2, plan-OPS-2026
--   SELECT graph_task_id, title FROM planner.v_visible_tasks ORDER BY plan_id, priority;
--   -- Expected: 15 tasks (task-I*, task-C*, task-O*), NOT task-S*, task-P*, task-PD*, etc.
--   ROLLBACK;
--
-- mgr-002 (Security) — sees plans SEC, PENTEST and all security team tasks:
--   BEGIN;
--   SELECT set_config('app.tenant_id', '550e8400-e29b-41d4-a716-446655440000', true);
--   SELECT set_config('app.user_id', 'mgr-002', true);
--   SELECT graph_plan_id FROM planner.v_visible_plans;
--   -- Expected: plan-SEC-Q2, plan-PENTEST-2026
--   ROLLBACK;
--
-- inf-001 (direct report of mgr-001) — sees only plans they are a member of:
--   BEGIN;
--   SELECT set_config('app.tenant_id', '550e8400-e29b-41d4-a716-446655440000', true);
--   SELECT set_config('app.user_id', 'inf-001', true);
--   SELECT graph_plan_id FROM planner.v_visible_plans;
--   -- Expected: plan-INFRA-2026, plan-CLOUD-Q2 (not plan-OPS-2026, not any security/product plans)
--   ROLLBACK;
--
-- Infrastructure review workflow (as mgr-001):
--   BEGIN;
--   SELECT set_config('app.tenant_id', '550e8400-e29b-41d4-a716-446655440000', true);
--   SELECT set_config('app.user_id', 'mgr-001', true);
--   -- 1. List tasks not done, not blocked:
--   SELECT t.graph_task_id, t.title, t.percent_complete, b.name AS bucket
--   FROM planner.v_visible_tasks t
--   JOIN connector_ms365_planner.planner_buckets_cache b
--     ON b.tenant_id = t.tenant_id AND b.graph_bucket_id = t.bucket_id
--   WHERE t.percent_complete < 100
--   ORDER BY t.priority, t.due_date NULLS LAST;
--   -- 2. Find BLOCKED tasks (in progress, not modified for 3+ days):
--   SELECT graph_task_id, title, percent_complete, last_modified_at_graph
--   FROM planner.v_visible_tasks
--   WHERE percent_complete BETWEEN 1 AND 99
--     AND last_modified_at_graph < NOW() - INTERVAL '3 days';
--   ROLLBACK;
