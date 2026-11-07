import fs from 'node:fs';

const editorPath = 'apps/web/src/features/organizer/EventEditorPage.tsx';
let editor = fs.readFileSync(editorPath, 'utf8');

const stickyBar = `      {/* Sticky Bottom Save Bar */}
      <div className="sticky bottom-0 z-30 -mx-4 -mb-8 px-4 sm:px-8 py-3.5 bg-white/95 dark:bg-stone-900/95 backdrop-blur-md border-t border-border flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">
            {checklist.filter((c) => c.valid).length} / {checklist.length} readiness requirements met
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate('/organizer')}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => saveEventMutation.mutate()}
            disabled={saveEventMutation.isPending}
            className="gap-2 shadow-sm font-semibold"
          >
            <Save className="h-4 w-4" />
            <span>{saveEventMutation.isPending ? 'Saving...' : 'Save & Update Event'}</span>
          </Button>
        </div>
      </div>
    </div>
  );
};`;

if (!editor.includes('Sticky Bottom Save Bar')) {
  editor = editor.replace('    </div>\n  );\n};', stickyBar);
  fs.writeFileSync(editorPath, editor, 'utf8');
  console.log('EventEditorPage.tsx updated with sticky save bar');
} else {
  console.log('Already has sticky save bar');
}
