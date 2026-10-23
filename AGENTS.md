# Architecture rules

- Internal pages live under the pathless `_painel` layout (sidebar + header + mobile nav) — one shared shell for all modules.
- Navigation items are defined only in `src/components/layout/nav-items.ts` — sidebar and mobile nav read from one source.
- Mock data lives only in `src/lib/mock/` — easy to delete when real Supabase queries arrive.
- Reusable UI blocks live in `src/components/shared/` (StatCard, DataTable, StatusBadge, FilterBar, FormModal, FormField, ChartCard, PageHeader, EmptyState).
- Feedback messages go through `src/lib/notify.ts`; destructive actions always wrap in `ConfirmDialog` — consistent UX.
- Layout breakpoints: phone = bottom nav (<md), tablet = icon rail (md), desktop = full sidebar (lg+).
