import fs from 'node:fs';

const orgPath = 'apps/web/src/features/organizer/OrganizerDashboard.tsx';
let org = fs.readFileSync(orgPath, 'utf8');

const oldCards = `      {/* StatCards Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Club Events"
          value={events.length}
          icon={<Calendar className="h-4 w-4" />}
          change={\`\${filteredEvents.length} in current view\`}
        />
        <StatCard
          label="Active & Published"
          value={activeCount}
          icon={<Sparkles className="h-4 w-4" />}
          intent="teal"
        />
        <StatCard
          label="Confirmed Attendees"
          value={totalRegistered}
          icon={<Users className="h-4 w-4" />}
        />
        <StatCard
          label="Total Capacity"
          value={totalCapacity}
          icon={<TrendingUp className="h-4 w-4" />}
        />
      </div>`;

const newCards = `      {/* StatCards Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Club Events"
          value={events.length}
          icon={<Calendar className="h-4 w-4" />}
          helperText={\`\${filteredEvents.length} in current view\`}
        />
        <StatCard
          title="Active & Published"
          value={activeCount}
          icon={<Sparkles className="h-4 w-4" />}
          helperText="Live or ready to join"
        />
        <StatCard
          title="Confirmed Attendees"
          value={totalRegistered}
          icon={<Users className="h-4 w-4" />}
          helperText="Across all events"
        />
        <StatCard
          title="Total Capacity"
          value={totalCapacity}
          icon={<TrendingUp className="h-4 w-4" />}
          helperText="Cumulative seats"
        />
      </div>`;

org = org.replace(oldCards, newCards);
fs.writeFileSync(orgPath, org, 'utf8');
console.log('Fixed StatCard props in OrganizerDashboard.tsx');
