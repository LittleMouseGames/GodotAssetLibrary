import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeRepositoryUrl, normalizeProjectTitle } from '../src/core/utils/repositoryNormalization'
import { evaluateStoreLink } from '../src/app/utilities/fetchFromGodotStore/services/linkStoreToLegacy'

describe('normalizeRepositoryUrl', () => {
  it('normalizes GitHub/GitLab/Codeberg repository URLs', () => {
    assert.equal(normalizeRepositoryUrl('https://github.com/Owner/Repo'), 'github.com/owner/repo')
    assert.equal(normalizeRepositoryUrl('https://github.com/Owner/Repo.git'), 'github.com/owner/repo')
    assert.equal(normalizeRepositoryUrl('https://www.github.com/owner/repo?tab=readme'), 'github.com/owner/repo')
    assert.equal(normalizeRepositoryUrl('https://codeberg.org/Phazorknight/Cogito'), 'codeberg.org/phazorknight/cogito')
    assert.equal(normalizeRepositoryUrl('https://gitlab.com/group/project'), 'gitlab.com/group/project')
  })

  it('rejects non-repository, profile, and subdirectory URLs', () => {
    assert.equal(normalizeRepositoryUrl('https://github.com/owner'), null)
    assert.equal(normalizeRepositoryUrl('https://github.com/owner/repo/issues/1'), null)
    assert.equal(normalizeRepositoryUrl('https://example.com/owner/repo'), null)
    assert.equal(normalizeRepositoryUrl('https://github.com/owner/repo/subdir'), null)
    assert.equal(normalizeRepositoryUrl('https://user:pass@github.com/owner/repo'), null)
    assert.equal(normalizeRepositoryUrl(''), null)
    assert.equal(normalizeRepositoryUrl(undefined), null)
    assert.equal(normalizeRepositoryUrl('ftp://github.com/owner/repo'), null)
  })
})

describe('normalizeProjectTitle', () => {
  it('normalizes punctuation and whitespace consistently', () => {
    // Straight and curly apostrophes both collapse to a single space, so the
    // two spellings of the same title compare equal.
    assert.equal(normalizeProjectTitle('Maaack\'s Game Template'), normalizeProjectTitle('Maaack’s Game Template'))
    assert.equal(normalizeProjectTitle('Maaack\'s Game Template'), 'maaack s game template')
    assert.equal(normalizeProjectTitle('  Godot   Shader Pack  '), 'godot shader pack')
  })
})

describe('evaluateStoreLink', () => {
  const candidate = {
    asset_id: 'abc123',
    title: 'Cogito',
    normalized_repository: 'codeberg.org/phazorknight/cogito',
    type: 'Tool'
  }

  it('auto-links on a unique repo + strict title + compatible type', () => {
    const decision = evaluateStoreLink(
      { normalized_repository: 'codeberg.org/phazorknight/cogito', title: 'Cogito', source_type: 0 },
      [candidate]
    )
    assert.equal(decision.action, 'link')
    assert.equal(decision.candidate?.asset_id, 'abc123')
  })

  it('suggests (does not auto-link) when the title differs', () => {
    const decision = evaluateStoreLink(
      { normalized_repository: 'codeberg.org/phazorknight/cogito', title: 'Cogito Remake', source_type: 0 },
      [candidate]
    )
    assert.equal(decision.action, 'suggest')
    assert.equal(decision.candidate?.asset_id, 'abc123')
  })

  it('suggests (does not auto-link) when multiple candidates share the repo', () => {
    const decision = evaluateStoreLink(
      { normalized_repository: 'github.com/owner/repo', title: 'Pack', source_type: 0 },
      [
        { ...candidate, asset_id: 'a', normalized_repository: 'github.com/owner/repo', title: 'Pack' },
        { ...candidate, asset_id: 'b', normalized_repository: 'github.com/owner/repo', title: 'Pack' }
      ]
    )
    assert.equal(decision.action, 'suggest')
  })

  it('returns none when there is no repository', () => {
    const decision = evaluateStoreLink({ normalized_repository: '', title: 'X', source_type: 0 }, [candidate])
    assert.equal(decision.action, 'none')
    assert.equal(decision.candidate, null)
  })

  it('returns none when no candidate matches the repository', () => {
    const decision = evaluateStoreLink(
      { normalized_repository: 'github.com/other/project', title: 'Cogito', source_type: 0 },
      [candidate]
    )
    assert.equal(decision.action, 'none')
  })
})
