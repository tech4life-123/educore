-- Seven fictional schools across six counties (run in the Supabase SQL editor).
-- Differences between schools are invented to show how the dashboards reveal gaps;
-- they say nothing about real schools or counties.
--                        code       name                                 city           county         motto                            colour    strength attendance sections(G9-12) size
select demo.create_school('DEMO-01', 'Harmony Hills High School (Demo)', 'Monrovia',    'Montserrado', 'Knowledge, Discipline, Service', '#1E3A8A',  5, 0.94, array[2,2,2,2], 30, 38);
select demo.create_school('DEMO-02', 'Sunrise Academy (Demo)',           'Paynesville', 'Montserrado', 'Rise and Shine',                 '#047857',  2, 0.92, array[2,1,1,1], 25, 33);
select demo.create_school('DEMO-03', 'Cedar Grove High School (Demo)',   'Gbarnga',     'Bong',        'Learning for Life',              '#7C2D12',  0, 0.90, array[1,1,1,1], 24, 32);
select demo.create_school('DEMO-04', 'Unity Heights High School (Demo)', 'Ganta',       'Nimba',       'United in Learning',             '#6D28D9',  1, 0.91, array[1,1,1,1], 24, 32);
select demo.create_school('DEMO-05', 'Riverside High School (Demo)',     'Kakata',      'Margibi',     'Excellence Through Effort',      '#B91C1C', -2, 0.89, array[1,1,1,1], 24, 32);
select demo.create_school('DEMO-06', 'Lakeview Academy (Demo)',          'Buchanan',    'Grand Bassa', 'Light and Truth',                '#0E7490', -4, 0.87, array[1,1,1,1], 22, 30);
select demo.create_school('DEMO-07', 'Hilltop High School (Demo)',       'Voinjama',    'Lofa',        'Strive to Succeed',              '#A16207', -5, 0.85, array[1,1,1,1], 20, 30);
