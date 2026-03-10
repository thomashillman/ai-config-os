import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseSkill } from './parse-skill.mjs';

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeDependency(entry) {
  if (typeof entry === 'string') {
    return entry.trim();
  }

  if (entry && typeof entry === 'object' && typeof entry.name === 'string') {
    return entry.name.trim();
  }

  return '';
}

function normalizeVariants(frontmatter) {
  const variants = frontmatter?.variants;
  if (!variants || typeof variants !== 'object' || Array.isArray(variants)) {
    return [];
  }

  return Object.entries(variants)
    .filter(([name]) => name !== 'fallback_chain')
    .map(([name, config]) => ({
      name,
      config: config && typeof config === 'object' ? config : {},
      promptFile:
        config && typeof config === 'object' && typeof config.prompt_file === 'string'
          ? config.prompt_file.trim()
          : '',
    }));
}

function normalizeSkillModel({ skillDir, filePath, frontmatter }) {
  const name = typeof frontmatter?.skill === 'string' ? frontmatter.skill.trim() : '';
  const dependencies = asArray(frontmatter?.dependencies?.skills)
    .map(normalizeDependency)
    .filter(Boolean);
  const description = typeof frontmatter?.description === 'string' ? frontmatter.description.trim() : '';
  const type = typeof frontmatter?.type === 'string' ? frontmatter.type.trim() : '';

  return {
    name,
    skillDir,
    filePath,
    frontmatter,
    dependencies,
    variants: normalizeVariants(frontmatter),
    description,
    type,
  };
}

export function loadSkillModels(repoRoot) {
  const skillsDir = join(repoRoot, 'shared', 'skills');
  const models = [];
  const errors = [];

  if (!existsSync(skillsDir)) {
    return { models, errors: [`Skills directory not found: ${skillsDir}`] };
  }

  const entries = readdirSync(skillsDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && entry.name !== '_template')
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    const skillDir = join(skillsDir, entry.name);
    const filePath = join(skillDir, 'SKILL.md');
    if (!existsSync(filePath)) {
      errors.push(`Skill ${entry.name}: missing SKILL.md`);
      continue;
    }

    try {
      const parsed = parseSkill(filePath);
      models.push(normalizeSkillModel({ skillDir, filePath, frontmatter: parsed.frontmatter }));
    } catch (error) {
      errors.push(`Skill ${entry.name}: ${error.message}`);
    }
  }

  return { models, errors };
}

export function validateDependencies(models) {
  const errors = [];
  const knownSkills = new Set(models.map(model => model.name).filter(Boolean));

  for (const model of models) {
    for (const dependency of model.dependencies) {
      if (!knownSkills.has(dependency)) {
        errors.push(`Skill ${model.name || '(unknown)'}: dependency '${dependency}' not found`);
      }
    }
  }

  return errors;
}

export function validateVariants(models) {
  const errors = [];

  for (const model of models) {
    for (const variant of model.variants) {
      const promptFile = variant.promptFile;
      if (!promptFile) {
        errors.push(`Skill ${model.name || '(unknown)'}: variant '${variant.name}' missing prompt_file`);
        continue;
      }

      const absolutePromptPath = join(model.skillDir, promptFile);
      if (!existsSync(absolutePromptPath)) {
        errors.push(
          `Skill ${model.name || '(unknown)'}: variant '${variant.name}' references missing file '${promptFile}'`
        );
      }
    }
  }

  return errors;
}

export function validateDocsMetadata(models) {
  const errors = [];

  for (const model of models) {
    if (!model.name) {
      errors.push(`Skill file ${model.filePath}: missing required metadata field 'skill'`);
    }
    if (!model.description) {
      errors.push(`Skill ${model.name || '(unknown)'}: missing required metadata field 'description'`);
    }
    if (!model.type) {
      errors.push(`Skill ${model.name || '(unknown)'}: missing required metadata field 'type'`);
    }
  }

  return errors;
}
