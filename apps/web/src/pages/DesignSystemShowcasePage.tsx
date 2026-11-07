import React, { useState } from 'react';
import {
  Button,
  Input,
  Textarea,
  Select,
  Checkbox,
  Switch,
  CodeInput,
  CopyButton,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Badge,
  StatusPill,
  Avatar,
  AvatarStack,
  Stepper,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  ConfirmDialog,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  Skeleton,
  EmptyState,
  ErrorState,
  PageHeader,
  DataTable,
  StatCard,
  ProgressMeter,
} from '@/components/shared';
import {
  Calendar,
  Sparkles,
  Users,
  Award,
  Download,
  Share2,
  Trash2,
  CheckCircle2,
  Plus,
  ArrowRight,
  MoreVertical,
} from 'lucide-react';

export const DesignSystemShowcasePage: React.FC = () => {
  // Interactive component states
  const [demoCode, setDemoCode] = useState('K7M29QXA');
  const [activeStep, setActiveStep] = useState(1);
  const [switchChecked, setSwitchChecked] = useState(true);
  const [checkboxChecked, setCheckboxChecked] = useState(true);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [progressVal, setProgressVal] = useState(65);

  const demoSteps = [
    { id: 1, label: 'Event Details', description: 'Basic info' },
    { id: 2, label: 'Team Setup', description: 'Roster & code' },
    { id: 3, label: 'Verification', description: 'Review answers' },
    { id: 4, label: 'Confirmation', description: 'Ticket issued' },
  ];

  const demoTableData = [
    { id: '1', name: 'Sai Kiran', roll: '22CS014', dept: 'CSE', status: 'CONFIRMED', team: 'AlgoKnights' },
    { id: '2', name: 'Priya Sharma', roll: '22EC089', dept: 'ECE', status: 'PENDING', team: 'CircuitBreakers' },
    { id: '3', name: 'Arjun Mehta', roll: '22ME045', dept: 'MECH', status: 'WAITLISTED', team: 'RoboTech' },
    { id: '4', name: 'Ananya Rao', roll: '22CS102', dept: 'CSE', status: 'CANCELLED', team: 'DataWizards' },
  ];

  const demoColumns = [
    { id: 'name', header: 'Student Name', accessorKey: 'name' as const, sortable: true },
    { id: 'roll', header: 'Roll No', accessorKey: 'roll' as const, sortable: true },
    { id: 'dept', header: 'Department', accessorKey: 'dept' as const },
    {
      id: 'team',
      header: 'Team',
      cell: (item: any) => (
        <span className="font-semibold text-teal-800 dark:text-teal-300">{item.team}</span>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      cell: (item: any) => <StatusPill status={item.status} size="sm" />,
    },
  ];

  const avatarDemoItems = [
    { name: 'Alice Smith', src: null },
    { name: 'Bob Jones', src: null },
    { name: 'Charlie Ray', src: null },
    { name: 'David Lee', src: null },
    { name: 'Eva Green', src: null },
  ];

  return (
    <div className="max-w-content mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-12 text-left" data-testid="design-system-showcase">
      {/* 1. Page Header */}
      <PageHeader
        breadcrumbs={[
          { label: 'Eventora OS', href: '/' },
          { label: 'System Architecture', href: '#' },
          { label: 'Design System' },
        ]}
        title="Eventora Design System & Component Library"
        subtitle="Accessible, high-contrast, WCAG AA compliant design system built with custom stone and teal tokens, Manrope headings, Inter UI typography, and JetBrains Mono code displays."
        badge={<Badge variant="primary" size="md" leftDot>Pass 1 Release</Badge>}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" leftIcon={<Download className="h-4 w-4 stroke-[1.75]" />}>
              Export Specs
            </Button>
            <Button size="sm" leftIcon={<Sparkles className="h-4 w-4 stroke-[1.75]" />}>
              Component Docs
            </Button>
          </div>
        }
      />

      {/* 2. Color Tokens & Semantic Hierarchy */}
      <section className="space-y-4">
        <div className="border-b border-stone-200 pb-2">
          <h2 className="font-heading text-xl font-bold text-stone-900 dark:text-stone-100">
            Design Tokens & Typography
          </h2>
          <p className="text-xs text-stone-600 dark:text-stone-400">
            Neutral Stone (50-900), Brand Teal (50-800), Accent Amber, and Semantic States.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          <div className="p-3 rounded-md border border-stone-200 bg-white dark:bg-stone-900">
            <div className="h-10 rounded bg-[#FAFAF9] border border-stone-200" />
            <p className="text-xs font-bold mt-2">Stone 50</p>
            <p className="text-[10px] text-stone-500 font-mono">#FAFAF9 (Page BG)</p>
          </div>
          <div className="p-3 rounded-md border border-stone-200 bg-white dark:bg-stone-900">
            <div className="h-10 rounded bg-[#E7E5E4]" />
            <p className="text-xs font-bold mt-2">Stone 200</p>
            <p className="text-[10px] text-stone-500 font-mono">#E7E5E4 (Borders)</p>
          </div>
          <div className="p-3 rounded-md border border-stone-200 bg-white dark:bg-stone-900">
            <div className="h-10 rounded bg-[#292524]" />
            <p className="text-xs font-bold mt-2 text-stone-900 dark:text-stone-100">Stone 800</p>
            <p className="text-[10px] text-stone-500 font-mono">#292524 (Body Text)</p>
          </div>
          <div className="p-3 rounded-md border border-stone-200 bg-white dark:bg-stone-900">
            <div className="h-10 rounded bg-[#0F766E]" />
            <p className="text-xs font-bold mt-2">Teal 700</p>
            <p className="text-[10px] text-stone-500 font-mono">#0F766E (Primary Brand)</p>
          </div>
          <div className="p-3 rounded-md border border-stone-200 bg-white dark:bg-stone-900">
            <div className="h-10 rounded bg-[#FEF3C7] border border-amber-300" />
            <p className="text-xs font-bold mt-2">Amber 100</p>
            <p className="text-[10px] text-stone-500 font-mono">#FEF3C7 (Highlights)</p>
          </div>
          <div className="p-3 rounded-md border border-stone-200 bg-white dark:bg-stone-900">
            <div className="h-10 rounded bg-[#15803D]" />
            <p className="text-xs font-bold mt-2">Success</p>
            <p className="text-[10px] text-stone-500 font-mono">#15803D (Semantic)</p>
          </div>
        </div>
      </section>

      {/* 3. Stat Cards & Metrics */}
      <section className="space-y-4">
        <h3 className="font-heading text-lg font-bold">Metrics & Stat Cards (Tabular Numerals)</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Total Registrations"
            value="1,420"
            helperText="Across 18 campus clubs"
            change={{ value: '+14.2%', trend: 'up' }}
            icon={<Users className="h-4 w-4 stroke-[1.75]" />}
          />
          <StatCard
            title="Check-in Velocity"
            value="382 / hr"
            helperText="Peak gate check-in throughput"
            change={{ value: '+5.8%', trend: 'up' }}
            icon={<Calendar className="h-4 w-4 stroke-[1.75]" />}
          />
          <StatCard
            title="Team Join Success"
            value="98.6%"
            helperText="Avg join code completion time 6.2s"
            change={{ value: '-0.4%', trend: 'neutral' }}
            icon={<Award className="h-4 w-4 stroke-[1.75]" />}
          />
          <StatCard
            title="Unresolved Doubts"
            value="3"
            helperText="Faculty doubt room queue"
            change={{ value: '-2', trend: 'down' }}
            icon={<Sparkles className="h-4 w-4 stroke-[1.75]" />}
          />
        </div>
      </section>

      {/* 4. Buttons, Sizes & States */}
      <section className="space-y-4">
        <h3 className="font-heading text-lg font-bold">Buttons (Variants, Sizes & Loaders)</h3>
        <Card className="p-6 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary">Primary Action</Button>
            <Button variant="secondary">Secondary Action</Button>
            <Button variant="outline">Outline Button</Button>
            <Button variant="ghost">Ghost Button</Button>
            <Button variant="destructive">Destructive Action</Button>
            <Button variant="link">Inline Link</Button>
          </div>
          <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-stone-100 dark:border-stone-800">
            <Button size="sm">Small (h-8)</Button>
            <Button size="md">Medium (h-10)</Button>
            <Button size="lg">Large (h-12)</Button>
            <Button isLoading>Processing...</Button>
            <Button leftIcon={<Plus className="h-4 w-4 stroke-[1.75]" />}>With Left Icon</Button>
            <Button rightIcon={<ArrowRight className="h-4 w-4 stroke-[1.75]" />}>With Right Icon</Button>
            <CopyButton textToCopy="K7M2-9QXA" label="Copy Code" />
          </div>
        </Card>
      </section>

      {/* 5. Stepper Component */}
      <section className="space-y-4">
        <h3 className="font-heading text-lg font-bold">Stepper (Responsive Desktop & Compact Mobile)</h3>
        <Card className="p-6 space-y-6">
          <Stepper
            steps={demoSteps}
            activeStep={activeStep}
            onStepClick={(idx) => setActiveStep(idx)}
          />
          <div className="flex items-center justify-between pt-2">
            <Button
              variant="outline"
              size="sm"
              disabled={activeStep === 0}
              onClick={() => setActiveStep((p) => Math.max(p - 1, 0))}
            >
              Previous Step
            </Button>
            <Button
              size="sm"
              disabled={activeStep === demoSteps.length - 1}
              onClick={() => setActiveStep((p) => Math.min(p + 1, demoSteps.length - 1))}
            >
              Next Step
            </Button>
          </div>
        </Card>
      </section>

      {/* 6. Form Controls & Segmented CodeInput */}
      <section className="space-y-4">
        <h3 className="font-heading text-lg font-bold">Form Controls & Segmented Code Input</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Form Inputs */}
          <Card className="p-6 space-y-4">
            <Input
              label="Student Full Name"
              placeholder="e.g. Sai Kiran Roopreddy"
              helperText="Enter your official campus ID name."
              required
            />
            <Input
              label="Roll Number / Student ID"
              placeholder="e.g. 22CS014"
              error="Roll number must be formatted correctly."
            />
            <Select
              label="Academic Department"
              placeholder="Select your branch..."
              options={[
                { value: 'cse', label: 'Computer Science and Engineering' },
                { value: 'ece', label: 'Electronics & Communication' },
                { value: 'mech', label: 'Mechanical Engineering' },
                { value: 'civil', label: 'Civil Engineering' },
              ]}
              required
            />
            <Textarea
              label="Team Project Pitch / Abstract"
              placeholder="Provide a concise 2-sentence summary of your hackathon project..."
              rows={3}
            />
            <div className="space-y-3 pt-2">
              <Checkbox
                label="I agree to the Eventora campus code of conduct and rules."
                checked={checkboxChecked}
                onChange={(e) => setCheckboxChecked(e.target.checked)}
              />
              <Switch
                label="Allow team members to edit project deliverables"
                helperText="Leader approval is still required before final submission."
                checked={switchChecked}
                onCheckedChange={setSwitchChecked}
              />
            </div>
          </Card>

          {/* Code Input & Highlight Cards */}
          <div className="space-y-6">
            <Card variant="amber-highlight" className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-900 dark:text-amber-300">
                  Team Join Code Card
                </span>
                <StatusPill status="ACTIVE" size="sm" />
              </div>

              <div className="p-4 rounded-md bg-white dark:bg-stone-900 border border-amber-300 dark:border-amber-700/60 shadow-inner">
                <p className="text-xs text-stone-500 mb-2 text-center">
                  Segmented 8-character Crockford base32 input with auto-formatting:
                </p>
                <CodeInput value={demoCode} onChange={setDemoCode} />
              </div>

              <div className="flex items-center justify-between text-xs text-amber-900 dark:text-amber-300">
                <span>Code format: XXXX-XXXX</span>
                <CopyButton textToCopy={demoCode} size="sm" />
              </div>
            </Card>

            <Card variant="teal-highlight" className="p-6 space-y-3">
              <h4 className="font-heading font-bold text-teal-900 dark:text-teal-200">
                Subtle Teal Gradient Surface
              </h4>
              <p className="text-xs text-stone-600 dark:text-stone-300 leading-relaxed">
                Reserved strictly for primary hero sections and code confirmation cards without glassmorphism.
              </p>
              <ProgressMeter
                value={progressVal}
                max={100}
                label="Team Roster Capacity"
                variant="dynamic"
              />
              <div className="flex gap-2 pt-2">
                <Button size="sm" variant="outline" onClick={() => setProgressVal(40)}>40%</Button>
                <Button size="sm" variant="outline" onClick={() => setProgressVal(75)}>75%</Button>
                <Button size="sm" variant="outline" onClick={() => setProgressVal(95)}>95%</Button>
              </div>
            </Card>
          </div>
        </div>
      </section>

      {/* 7. Badges, Pills & Avatars */}
      <section className="space-y-4">
        <h3 className="font-heading text-lg font-bold">Badges, Status Pills & Avatar Stacks</h3>
        <Card className="p-6 space-y-6">
          <div className="space-y-2">
            <p className="text-xs font-semibold text-stone-500">Badges</p>
            <div className="flex flex-wrap gap-2">
              <Badge variant="neutral">Neutral Badge</Badge>
              <Badge variant="primary" leftDot>Primary Teal</Badge>
              <Badge variant="amber" leftDot>Amber Highlight</Badge>
              <Badge variant="success" leftDot>Success Green</Badge>
              <Badge variant="warning" leftDot>Warning Amber</Badge>
              <Badge variant="danger" leftDot>Danger Red</Badge>
              <Badge variant="info" leftDot>Info Blue</Badge>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold text-stone-500">Status Pills</p>
            <div className="flex flex-wrap gap-2">
              <StatusPill status="CONFIRMED" />
              <StatusPill status="ACTIVE" />
              <StatusPill status="PENDING" />
              <StatusPill status="WAITLISTED" />
              <StatusPill status="CANCELLED" />
              <StatusPill status="LEADER" />
              <StatusPill status="MEMBER" />
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold text-stone-500">Avatars & Stacks</p>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Avatar name="Sai Kiran" size="xs" />
                <Avatar name="Priya Sharma" size="sm" />
                <Avatar name="Arjun Mehta" size="md" />
                <Avatar name="Ananya Rao" size="lg" />
              </div>
              <div className="border-l border-stone-200 pl-6">
                <AvatarStack items={avatarDemoItems} max={3} size="md" />
              </div>
            </div>
          </div>
        </Card>
      </section>

      {/* 8. Tabs, Dialogs & Dropdowns */}
      <section className="space-y-4">
        <h3 className="font-heading text-lg font-bold">Tabs, Dialogs & Action Menus</h3>
        <Card className="p-6 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <Tabs defaultValue="all" className="w-full sm:w-auto">
              <TabsList>
                <TabsTrigger value="all">All Registrations</TabsTrigger>
                <TabsTrigger value="teams">Teams & Rosters</TabsTrigger>
                <TabsTrigger value="pending">Pending Review</TabsTrigger>
              </TabsList>
              <TabsContent value="all" className="text-xs text-stone-600 mt-2">
                Showing all confirmed and active student participants.
              </TabsContent>
              <TabsContent value="teams" className="text-xs text-stone-600 mt-2">
                Team rosters with capacity meters and lead coordinates.
              </TabsContent>
              <TabsContent value="pending" className="text-xs text-stone-600 mt-2">
                Registrations awaiting organizer or faculty manual approval.
              </TabsContent>
            </Tabs>

            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" onClick={() => setConfirmOpen(true)}>
                Trigger Confirm Dialog
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon-sm">
                    <MoreVertical className="h-4 w-4 stroke-[1.75]" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Team Leader Actions</DropdownMenuLabel>
                  <DropdownMenuItem>Regenerate Join Code</DropdownMenuItem>
                  <DropdownMenuItem>Revoke Invite Code</DropdownMenuItem>
                  <DropdownMenuItem>Export Roster CSV</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive">Disband Team</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <ConfirmDialog
            open={confirmOpen}
            onOpenChange={setConfirmOpen}
            title="Revoke Team Join Code?"
            description="Revoking this code will immediately invalidate all shared links. Teammates who have not yet joined will need a newly generated code."
            confirmLabel="Revoke Code"
            variant="destructive"
            onConfirm={() => setConfirmOpen(false)}
          />
        </Card>
      </section>

      {/* 9. Responsive Data Table */}
      <section className="space-y-4">
        <div className="border-b border-stone-200 pb-2">
          <h3 className="font-heading text-lg font-bold">Responsive Data Table</h3>
          <p className="text-xs text-stone-600 dark:text-stone-400">
            Renders a sortable HTML table on screens &ge; 768px, and collapses cleanly into mobile cards below 768px.
          </p>
        </div>
        <DataTable
          columns={demoColumns}
          data={demoTableData}
          keyExtractor={(item) => item.id}
          onRowClick={(item) => console.log('Row clicked:', item)}
        />
      </section>

      {/* 10. Skeletons, Empty & Error States */}
      <section className="space-y-4">
        <h3 className="font-heading text-lg font-bold">Feedback States (Skeleton, Empty & Error)</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Skeleton */}
          <Card className="p-5 space-y-3">
            <p className="text-xs font-bold text-stone-500 uppercase tracking-wider">Skeleton Shimmer</p>
            <div className="flex items-center gap-3">
              <Skeleton variant="circular" className="h-10 w-10" />
              <div className="space-y-1.5 flex-1">
                <Skeleton variant="text" className="h-4 w-3/4" />
                <Skeleton variant="text" className="h-3 w-1/2" />
              </div>
            </div>
            <Skeleton variant="rounded" className="h-20 w-full mt-2" />
          </Card>

          {/* Empty State */}
          <EmptyState
            title="No Teams Found"
            description="You have not created or joined a team for this hackathon yet."
            actionLabel="Create Team"
            onAction={() => {}}
          />

          {/* Error State */}
          <ErrorState
            title="Failed to Load Roster"
            message="Could not connect to the campus attendance service."
            onRetry={() => {}}
          />
        </div>
      </section>
    </div>
  );
};
