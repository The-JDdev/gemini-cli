/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Config, InboxSkill, InboxPatch } from '@google/gemini-cli-core';
import {
  dismissInboxSkill,
  listInboxSkills,
  listInboxPatches,
  moveInboxSkill,
  applyInboxPatch,
  dismissInboxPatch,
} from '@google/gemini-cli-core';
import { waitFor } from '../../test-utils/async.js';
import { renderWithProviders } from '../../test-utils/render.js';
import { SkillInboxDialog } from './SkillInboxDialog.js';

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@google/gemini-cli-core')>();

  return {
    ...original,
    dismissInboxSkill: vi.fn(),
    listInboxSkills: vi.fn(),
    listInboxPatches: vi.fn(),
    moveInboxSkill: vi.fn(),
    applyInboxPatch: vi.fn(),
    dismissInboxPatch: vi.fn(),
    getErrorMessage: vi.fn((error: unknown) =>
      error instanceof Error ? error.message : String(error),
    ),
  };
});

const mockListInboxSkills = vi.mocked(listInboxSkills);
const mockListInboxPatches = vi.mocked(listInboxPatches);
const mockMoveInboxSkill = vi.mocked(moveInboxSkill);
const mockDismissInboxSkill = vi.mocked(dismissInboxSkill);
const mockApplyInboxPatch = vi.mocked(applyInboxPatch);
const mockDismissInboxPatch = vi.mocked(dismissInboxPatch);

const inboxSkill: InboxSkill = {
  dirName: 'inbox-skill',
  name: 'Inbox Skill',
  description: 'A test skill',
  content:
    '---\nname: Inbox Skill\ndescription: A test skill\n---\n\n## Procedure\n1. Do the thing\n',
  extractedAt: '2025-01-15T10:00:00Z',
};

const inboxPatch: InboxPatch = {
  fileName: 'update-docs.patch',
  name: 'update-docs',
  entries: [
    {
      targetPath: '/home/user/.gemini/skills/docs-writer/SKILL.md',
      diffContent: [
        '--- /home/user/.gemini/skills/docs-writer/SKILL.md',
        '+++ /home/user/.gemini/skills/docs-writer/SKILL.md',
        '@@ -1,3 +1,4 @@',
        ' line1',
        ' line2',
        '+line2.5',
        ' line3',
      ].join('\n'),
    },
  ],
  extractedAt: '2025-01-20T14:00:00Z',
};

describe('SkillInboxDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListInboxSkills.mockResolvedValue([inboxSkill]);
    mockListInboxPatches.mockResolvedValue([]);
    mockMoveInboxSkill.mockResolvedValue({
      success: true,
      message: 'Moved "inbox-skill" to ~/.gemini/skills.',
    });
    mockDismissInboxSkill.mockResolvedValue({
      success: true,
      message: 'Dismissed "inbox-skill" from inbox.',
    });
    mockApplyInboxPatch.mockResolvedValue({
      success: true,
      message: 'Applied patch to 1 file.',
    });
    mockDismissInboxPatch.mockResolvedValue({
      success: true,
      message: 'Dismissed "update-docs.patch" from inbox.',
    });
  });

  it('disables the project destination when the workspace is untrusted', async () => {
    const config = {
      isTrustedFolder: vi.fn().mockReturnValue(false),
    } as unknown as Config;
    const onReloadSkills = vi.fn().mockResolvedValue(undefined);
    const { lastFrame, stdin, unmount, waitUntilReady } = await act(async () =>
      renderWithProviders(
        <SkillInboxDialog
          config={config}
          onClose={vi.fn()}
          onReloadSkills={onReloadSkills}
        />,
      ),
    );

    await waitFor(() => {
      expect(lastFrame()).toContain('Inbox Skill');
    });

    // Select skill → lands on preview
    await act(async () => {
      stdin.write('\r');
      await waitUntilReady();
    });

    await waitFor(() => {
      expect(lastFrame()).toContain('Review new skill');
    });

    // Select "Move" → lands on destination chooser
    await act(async () => {
      stdin.write('\r');
      await waitUntilReady();
    });

    await waitFor(() => {
      const frame = lastFrame();
      expect(frame).toContain('Project');
      expect(frame).toContain('unavailable until this workspace is trusted');
    });

    unmount();
  });

  it('shows inline feedback when moving a skill throws', async () => {
    mockMoveInboxSkill.mockRejectedValue(new Error('permission denied'));

    const config = {
      isTrustedFolder: vi.fn().mockReturnValue(true),
    } as unknown as Config;
    const { lastFrame, stdin, unmount, waitUntilReady } = await act(async () =>
      renderWithProviders(
        <SkillInboxDialog
          config={config}
          onClose={vi.fn()}
          onReloadSkills={vi.fn().mockResolvedValue(undefined)}
        />,
      ),
    );

    await waitFor(() => {
      expect(lastFrame()).toContain('Inbox Skill');
    });

    // Select skill → preview
    await act(async () => {
      stdin.write('\r');
      await waitUntilReady();
    });

    // Select "Move" → destination chooser
    await act(async () => {
      stdin.write('\r');
      await waitUntilReady();
    });

    // Select "Global" → triggers move
    await act(async () => {
      stdin.write('\r');
      await waitUntilReady();
    });

    await waitFor(() => {
      const frame = lastFrame();
      expect(frame).toContain('Move "Inbox Skill"');
      expect(frame).toContain('Failed to install skill: permission denied');
    });

    unmount();
  });

  it('shows inline feedback when reloading skills fails after a move', async () => {
    const config = {
      isTrustedFolder: vi.fn().mockReturnValue(true),
    } as unknown as Config;
    const onReloadSkills = vi
      .fn()
      .mockRejectedValue(new Error('reload hook failed'));
    const { lastFrame, stdin, unmount, waitUntilReady } = await act(async () =>
      renderWithProviders(
        <SkillInboxDialog
          config={config}
          onClose={vi.fn()}
          onReloadSkills={onReloadSkills}
        />,
      ),
    );

    await waitFor(() => {
      expect(lastFrame()).toContain('Inbox Skill');
    });

    // Select skill → preview
    await act(async () => {
      stdin.write('\r');
      await waitUntilReady();
    });

    // Select "Move" → destination chooser
    await act(async () => {
      stdin.write('\r');
      await waitUntilReady();
    });

    // Select "Global" → triggers move
    await act(async () => {
      stdin.write('\r');
      await waitUntilReady();
    });

    await waitFor(() => {
      expect(lastFrame()).toContain(
        'Moved "inbox-skill" to ~/.gemini/skills. Failed to reload skills: reload hook failed',
      );
    });
    expect(onReloadSkills).toHaveBeenCalledTimes(1);

    unmount();
  });

  describe('patch support', () => {
    it('shows patches alongside skills with section headers', async () => {
      mockListInboxPatches.mockResolvedValue([inboxPatch]);

      const config = {
        isTrustedFolder: vi.fn().mockReturnValue(true),
      } as unknown as Config;
      const { lastFrame, unmount } = await act(async () =>
        renderWithProviders(
          <SkillInboxDialog
            config={config}
            onClose={vi.fn()}
            onReloadSkills={vi.fn().mockResolvedValue(undefined)}
          />,
        ),
      );

      await waitFor(() => {
        const frame = lastFrame();
        expect(frame).toContain('New Skills');
        expect(frame).toContain('Inbox Skill');
        expect(frame).toContain('Skill Updates');
        expect(frame).toContain('update-docs');
      });

      unmount();
    });

    it('shows diff preview when a patch is selected', async () => {
      mockListInboxSkills.mockResolvedValue([]);
      mockListInboxPatches.mockResolvedValue([inboxPatch]);

      const config = {
        isTrustedFolder: vi.fn().mockReturnValue(true),
      } as unknown as Config;
      const { lastFrame, stdin, unmount, waitUntilReady } = await act(
        async () =>
          renderWithProviders(
            <SkillInboxDialog
              config={config}
              onClose={vi.fn()}
              onReloadSkills={vi.fn().mockResolvedValue(undefined)}
            />,
          ),
      );

      await waitFor(() => {
        expect(lastFrame()).toContain('update-docs');
      });

      // Select the patch
      await act(async () => {
        stdin.write('\r');
        await waitUntilReady();
      });

      await waitFor(() => {
        const frame = lastFrame();
        expect(frame).toContain('Review changes before applying');
        expect(frame).toContain('Apply');
        expect(frame).toContain('Dismiss');
      });

      unmount();
    });

    it('applies a patch when Apply is selected', async () => {
      mockListInboxSkills.mockResolvedValue([]);
      mockListInboxPatches.mockResolvedValue([inboxPatch]);

      const config = {
        isTrustedFolder: vi.fn().mockReturnValue(true),
      } as unknown as Config;
      const onReloadSkills = vi.fn().mockResolvedValue(undefined);
      const { stdin, unmount, waitUntilReady } = await act(async () =>
        renderWithProviders(
          <SkillInboxDialog
            config={config}
            onClose={vi.fn()}
            onReloadSkills={onReloadSkills}
          />,
        ),
      );

      await waitFor(() => {
        expect(mockListInboxPatches).toHaveBeenCalled();
      });

      // Select the patch
      await act(async () => {
        stdin.write('\r');
        await waitUntilReady();
      });

      // Select "Apply"
      await act(async () => {
        stdin.write('\r');
        await waitUntilReady();
      });

      await waitFor(() => {
        expect(mockApplyInboxPatch).toHaveBeenCalledWith(
          config,
          'update-docs.patch',
        );
      });
      expect(onReloadSkills).toHaveBeenCalled();

      unmount();
    });

    it('dismisses a patch when Dismiss is selected', async () => {
      mockListInboxSkills.mockResolvedValue([]);
      mockListInboxPatches.mockResolvedValue([inboxPatch]);

      const config = {
        isTrustedFolder: vi.fn().mockReturnValue(true),
      } as unknown as Config;
      const onReloadSkills = vi.fn().mockResolvedValue(undefined);
      const { stdin, unmount, waitUntilReady } = await act(async () =>
        renderWithProviders(
          <SkillInboxDialog
            config={config}
            onClose={vi.fn()}
            onReloadSkills={onReloadSkills}
          />,
        ),
      );

      await waitFor(() => {
        expect(mockListInboxPatches).toHaveBeenCalled();
      });

      // Select the patch
      await act(async () => {
        stdin.write('\r');
        await waitUntilReady();
      });

      // Move down to "Dismiss" and select
      await act(async () => {
        stdin.write('\x1b[B');
        await waitUntilReady();
      });

      await act(async () => {
        stdin.write('\r');
        await waitUntilReady();
      });

      await waitFor(() => {
        expect(mockDismissInboxPatch).toHaveBeenCalledWith(
          config,
          'update-docs.patch',
        );
      });
      expect(onReloadSkills).not.toHaveBeenCalled();

      unmount();
    });
  });
});
