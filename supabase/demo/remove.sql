-- Deletes every demonstration school (is_demo = true) with all its rows and Auth accounts.
-- Real schools are never touched: demo.remove_school refuses any school without is_demo.
select demo.remove_all() as schools_removed;
