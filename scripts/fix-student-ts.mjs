import fs from 'node:fs';

// 1. Fix TeamJoinPage.tsx
const teamJoinPath = 'apps/web/src/features/team/TeamJoinPage.tsx';
let teamJoin = fs.readFileSync(teamJoinPath, 'utf8');

// Ensure errorInfo type safety and Link replacement
teamJoin = teamJoin.replace(
  `                {errorInfo.actionHref && (
                  <div className="pt-1">
                    <Button asChild size="sm" variant="outline" className="h-7 text-xs border-red-300 text-red-800">
                      <Link to={errorInfo.actionHref}>{errorInfo.actionText || 'Take Action'}</Link>
                    </Button>
                  </div>
                )}`,
  `                {'actionHref' in errorInfo && (errorInfo as any).actionHref && (
                  <div className="pt-1">
                    <Link
                      to={(errorInfo as any).actionHref}
                      className="inline-flex items-center justify-center rounded-md text-xs font-semibold h-7 px-3 border border-red-300 text-red-800 bg-white/80 hover:bg-white transition-colors"
                    >
                      {(errorInfo as any).actionText || 'Take Action'}
                    </Link>
                  </div>
                )}`
);

if (!teamJoin.includes('export default TeamJoinPage;')) {
  teamJoin += '\nexport default TeamJoinPage;\n';
}
fs.writeFileSync(teamJoinPath, teamJoin, 'utf8');
console.log('TeamJoinPage.tsx fixed');

// 2. Fix PassportPage.tsx
const passportPath = 'apps/web/src/features/passport/PassportPage.tsx';
let passport = fs.readFileSync(passportPath, 'utf8');

passport = passport.replace(
  `action={{
                  label: 'Explore Campus Events',
                  href: '/',
                }}`,
  `actionLabel="Explore Campus Events"
                onAction={() => { window.location.href = '/'; }}`
);

passport = passport.replace(
  `action={{
                  label: "Join with Team Code",
                  href: "/teams/join",
                }}`,
  `actionLabel="Join with Team Code"
                onAction={() => { window.location.href = '/teams/join'; }}`
);

passport = passport.replace(
  `<CopyButton value={tkt.token} label="Copy Pass Code" />`,
  `<CopyButton textToCopy={tkt.token} label="Copy Pass Code" />`
);

passport = passport.replace(
  `<CopyButton value={formatTeamCode(team.code)} label="Copy Code" />`,
  `<CopyButton textToCopy={formatTeamCode(team.code)} label="Copy Code" />`
);

passport = passport.replace(
  `variant={team.leaderId === user?.id ? 'primary' : 'outline'}`,
  `variant={team.leaderId === user?.id ? 'primary' : 'neutral'}`
);

fs.writeFileSync(passportPath, passport, 'utf8');
console.log('PassportPage.tsx fixed');
