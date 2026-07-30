import { describe, it, expect } from 'vitest';

import {
  generateFieldId,
  createQuestion,
  flattenQuestions,
  buildQuestionTree,
  buildSurveyJson,
  getSpColumnKind,
  findFieldById,
  findFieldLocation,
  removeFieldRecursive,
  removeField,
  updateField,
  flattenFieldTree,
  validateFields,
  duplicateField,
  reorderFields,
  QUESTION_TYPES,
} from '../FormBuilderEngine';
import type { FormBuilderField, QuestionTypeDefinition, SurveyJson } from '../../types';

// ── Helpers ──────────────────────────────────────────────────────────────────────

function makeField(overrides: Partial<FormBuilderField> = {}): FormBuilderField {
  return {
    _id: 'test-id-001',
    type: 'text',
    name: 'testName',
    title: 'Test Title',
    isRequired: false,
    startWithNewLine: true,
    visible: true,
    readOnly: false,
    description: '',
    ...overrides,
  };
}

function makeSurveyJson(pages: { name: string; elements: Record<string, unknown>[] }[]): SurveyJson {
  return { title: 'Test Survey', pages };
}

// ── generateFieldId ──────────────────────────────────────────────────────────────

describe('generateFieldId', () => {
  it('returns a string starting with the default prefix "field"', () => {
    const id = generateFieldId();
    expect(id).toMatch(/^field_[a-z0-9]{8}$/);
  });

  it('returns a string starting with a custom prefix', () => {
    const id = generateFieldId('custom');
    expect(id).toMatch(/^custom_[a-z0-9]{8}$/);
  });

  it('produces unique IDs on successive calls', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateFieldId());
    }
    expect(ids.size).toBe(100);
  });

  it('handles empty string prefix', () => {
    const id = generateFieldId('');
    expect(id.startsWith('_')).toBe(true);
  });
});

// ── createQuestion ───────────────────────────────────────────────────────────────

describe('createQuestion', () => {
  it('creates a FormBuilderField from a QuestionTypeDefinition', () => {
    const td: QuestionTypeDefinition = {
      type: 'text',
      label: 'Text Input',
      icon: 'T',
      group: 'Basic',
      description: 'Single line text',
      spColumnKind: 2,
      defaultProps: { inputType: 'text', placeholder: 'Enter text' },
    };
    const field = createQuestion(td);
    expect(field.type).toBe('text');
    expect(field.name).toMatch(/^textInput/);
    expect(field.title).toBe('Text Input');
    expect(field.isRequired).toBe(false);
    expect(field._id).toMatch(/^field_/);
    expect(field.inputType).toBe('text');
    expect(field.placeholder).toBe('Enter text');
  });

  it('converts multi-word labels to camelCase names', () => {
    const td: QuestionTypeDefinition = {
      type: 'radiogroup',
      label: 'Radio Group',
      icon: 'R',
      group: 'Choice',
      description: '',
      spColumnKind: 6,
      defaultProps: {},
    };
    const field = createQuestion(td);
    expect(field.name).toBe('radioGroup');
  });

  it('handles labels with special characters', () => {
    const td: QuestionTypeDefinition = {
      type: 'text',
      label: 'First & Last Name!',
      icon: 'T',
      group: 'Basic',
      description: '',
      spColumnKind: 2,
      defaultProps: {},
    };
    const field = createQuestion(td);
    expect(field.name).not.toMatch(/[^a-zA-Z0-9]/);
    expect(field.name).toBe('firstLastName');
  });
});

// ── flattenQuestions ──────────────────────────────────────────────────────────────

describe('flattenQuestions', () => {
  it('returns an empty array for empty pages', () => {
    expect(flattenQuestions(makeSurveyJson([]))).toEqual([]);
  });

  it('returns an empty array when pages array is missing', () => {
    const json = { title: 'No Pages' } as SurveyJson;
    expect(flattenQuestions(json)).toEqual([]);
  });

  it('flattens a single page with flat elements', () => {
    const json = makeSurveyJson([
      { name: 'page1', elements: [{ type: 'text', name: 'q1', title: 'Q1' }, { type: 'number', name: 'q2', title: 'Q2' }] },
    ]);
    const result = flattenQuestions(json);
    expect(result).toHaveLength(2);
    expect(result[0].type).toBe('text');
    expect(result[1].type).toBe('number');
  });

  it('skips panel containers and only returns leaf fields', () => {
    const json = makeSurveyJson([
      {
        name: 'page1',
        elements: [
          { type: 'text', name: 'q1' },
          {
            type: 'panel',
            name: 'section',
            elements: [{ type: 'number', name: 'q2' }, { type: 'checkbox', name: 'q3' }],
          },
        ],
      },
    ]);
    const result = flattenQuestions(json);
    expect(result).toHaveLength(3); // q1, q2, q3 (panel itself is skipped)
    expect(result.map((f) => f.type)).toEqual(['text', 'number', 'checkbox']);
  });

  it('handles deeply nested panels', () => {
    const json = makeSurveyJson([
      {
        name: 'page1',
        elements: [
          {
            type: 'panel',
            elements: [
              { type: 'text', name: 'inner1' },
              {
                type: 'panel',
                elements: [{ type: 'number', name: 'deep' }],
              },
            ],
          },
        ],
      },
    ]);
    const result = flattenQuestions(json);
    expect(result).toHaveLength(2);
  });

  it('handles multiple pages', () => {
    const json = makeSurveyJson([
      { name: 'page1', elements: [{ type: 'text', name: 'a' }] },
      { name: 'page2', elements: [{ type: 'number', name: 'b' }, { type: 'checkbox', name: 'c' }] },
    ]);
    const result = flattenQuestions(json);
    expect(result).toHaveLength(3);
  });

  it('handles pages with no elements array', () => {
    const json = makeSurveyJson([
      { name: 'page1', elements: [{ type: 'text', name: 'a' }] },
      { name: 'page2', elements: [] as unknown as Record<string, unknown>[] },
    ]);
    const result = flattenQuestions(json);
    expect(result).toHaveLength(1);
  });
});

// ── buildQuestionTree ────────────────────────────────────────────────────────────

describe('buildQuestionTree', () => {
  it('returns an empty array for empty pages', () => {
    expect(buildQuestionTree(makeSurveyJson([]))).toEqual([]);
  });

  it('returns an empty array when pages array is missing', () => {
    const json = { title: 'No Pages' } as SurveyJson;
    expect(buildQuestionTree(json)).toEqual([]);
  });

  it('builds a tree preserving panel hierarchy', () => {
    const json = makeSurveyJson([
      {
        name: 'page1',
        elements: [
          { type: 'text', _id: 'id1', name: 'q1' },
          {
            type: 'panel',
            _id: 'panel1',
            elements: [{ type: 'number', _id: 'id2', name: 'q2' }],
          },
        ],
      },
    ]);
    const tree = buildQuestionTree(json);
    expect(tree).toHaveLength(2);
    expect(tree[0].type).toBe('text');
    expect(tree[1].type).toBe('panel');
    expect((tree[1] as FormBuilderField).elements).toHaveLength(1);
    expect((tree[1] as FormBuilderField).elements?.[0].type).toBe('number');
  });

  it('preserves _id when provided in elements', () => {
    const json = makeSurveyJson([
      { name: 'page1', elements: [{ type: 'text', _id: 'predefined-id', name: 'q1' }] },
    ]);
    const tree = buildQuestionTree(json);
    expect(tree[0]._id).toBe('predefined-id');
  });

  it('generates _id when not provided', () => {
    const json = makeSurveyJson([
      { name: 'page1', elements: [{ type: 'text', name: 'q1' }] },
    ]);
    const tree = buildQuestionTree(json);
    expect(tree[0]._id).toMatch(/^field_/);
  });

  it('handles deeply nested panels', () => {
    const json = makeSurveyJson([
      {
        name: 'page1',
        elements: [
          {
            type: 'panel',
            _id: 'p1',
            elements: [
              { type: 'text', _id: 't1' },
              {
                type: 'panel',
                _id: 'p2',
                elements: [{ type: 'number', _id: 'n1' }],
              },
            ],
          },
        ],
      },
    ]);
    const tree = buildQuestionTree(json);
    expect(tree).toHaveLength(1);
    const panel = tree[0] as FormBuilderField;
    expect(panel.elements).toHaveLength(2);
    const innerPanel = panel.elements![1] as FormBuilderField;
    expect(innerPanel.elements).toHaveLength(1);
    expect(innerPanel.elements![0].type).toBe('number');
  });

  it('handles multiple pages', () => {
    const json = makeSurveyJson([
      { name: 'page1', elements: [{ type: 'text', _id: 'a1' }] },
      { name: 'page2', elements: [{ type: 'number', _id: 'b1' }] },
    ]);
    const tree = buildQuestionTree(json);
    expect(tree).toHaveLength(2);
  });

  it('rehydrates saved dynamic matrix fields with column editor settings', () => {
    const field = makeField({
      type: 'dynamicmatrix',
      name: 'allowances',
      title: 'Allowances',
      columns: [
        { name: 'type', title: 'Type', cellType: 'dropdown', choices: ['Travel', 'Meal'] },
        { name: 'amount', title: 'Amount', cellType: 'number' },
      ],
      tableConfigColumns: [
        { name: 'type', title: 'Type', cellType: 'dropdown', choices: ['Travel', 'Meal'] },
        { name: 'amount', title: 'Amount', cellType: 'number' },
      ],
    });

    const savedJson = buildSurveyJson([field]);
    const tree = buildQuestionTree(savedJson);

    expect(tree[0].type).toBe('dynamicmatrix');
    expect(tree[0].columns).toEqual(field.columns);
    expect(tree[0].tableConfigColumns).toEqual(field.columns);
  });
});

// ── getSpColumnKind ──────────────────────────────────────────────────────────────

describe('getSpColumnKind', () => {
  it('returns null for dynamicmatrix type', () => {
    expect(getSpColumnKind({ type: 'dynamicmatrix' })).toBeNull();
  });

  it('returns null for tableinput type', () => {
    expect(getSpColumnKind({ type: 'tableinput' })).toBeNull();
  });

  it('returns null for matrixdynamic type', () => {
    expect(getSpColumnKind({ type: 'matrixdynamic' })).toBeNull();
  });

  it('returns Multi-line (3) for ranking', () => {
    expect(getSpColumnKind({ type: 'ranking' })).toEqual({ FieldTypeKind: 3, label: 'Multi-line' });
  });

  it('returns Number (9) for text type with number inputType', () => {
    expect(getSpColumnKind({ type: 'text', inputType: 'number' })).toEqual({ FieldTypeKind: 9, label: 'Number' });
  });

  it('returns Number (9) for text type with range inputType', () => {
    expect(getSpColumnKind({ type: 'text', inputType: 'range' })).toEqual({ FieldTypeKind: 9, label: 'Number' });
  });

  it('returns DateTime (4) for text type with date inputType', () => {
    expect(getSpColumnKind({ type: 'text', inputType: 'date' })).toEqual({ FieldTypeKind: 4, label: 'DateTime' });
  });

  it('returns DateTime (4) for text type with datetime-local inputType', () => {
    expect(getSpColumnKind({ type: 'text', inputType: 'datetime-local' })).toEqual({ FieldTypeKind: 4, label: 'DateTime' });
  });

  it('falls through to QUESTION_TYPES lookup for text+password (no special inputType handling)', () => {
    // "password" is in QUESTION_TYPES with spColumnKind: 2
    expect(getSpColumnKind({ type: 'password' })).toEqual({ FieldTypeKind: 2, label: 'Text' });
  });

  it('returns Text (2) for unknown type', () => {
    expect(getSpColumnKind({ type: 'unknown-type' })).toEqual({ FieldTypeKind: 2, label: 'Text' });
  });

  it('returns Text (2) for file type (stores URL reference)', () => {
    expect(getSpColumnKind({ type: 'file' })).toEqual({ FieldTypeKind: 2, label: 'Text' });
  });

  it('returns correct kind for dropdown (Choice 6)', () => {
    expect(getSpColumnKind({ type: 'dropdown' })).toEqual({ FieldTypeKind: 6, label: 'Choice' });
  });

  it('returns correct kind for boolean (Yes/No 8)', () => {
    expect(getSpColumnKind({ type: 'boolean' })).toEqual({ FieldTypeKind: 8, label: 'Yes/No' });
  });

  it('returns correct kind for checkbox (MultiChoice 15)', () => {
    expect(getSpColumnKind({ type: 'checkbox' })).toEqual({ FieldTypeKind: 15, label: 'MultiChoice' });
  });

  it('returns correct kind for comment (Multi-line 3)', () => {
    expect(getSpColumnKind({ type: 'comment' })).toEqual({ FieldTypeKind: 3, label: 'Multi-line' });
  });

  it('returns correct kind for datetime (DateTime 4)', () => {
    expect(getSpColumnKind({ type: 'datetime' })).toEqual({ FieldTypeKind: 4, label: 'DateTime' });
  });

  it('returns correct kind for signaturepad (Image 11)', () => {
    expect(getSpColumnKind({ type: 'signaturepad' })).toEqual({ FieldTypeKind: 11, label: 'Image' });
  });

  it('returns Text (2) for text type with password inputType (not in special switch)', () => {
    expect(getSpColumnKind({ type: 'text', inputType: 'password' })).toEqual({ FieldTypeKind: 2, label: 'Text' });
  });
});

// ── findFieldById ────────────────────────────────────────────────────────────────

describe('findFieldById', () => {
  it('finds a field at root level', () => {
    const fields: FormBuilderField[] = [
      makeField({ _id: 'a' }),
      makeField({ _id: 'b' }),
      makeField({ _id: 'c' }),
    ];
    expect(findFieldById(fields, 'b')).toBe(fields[1]);
  });

  it('finds a field nested inside a panel', () => {
    const fields: FormBuilderField[] = [
      makeField({ _id: 'a' }),
      makeField({
        _id: 'panel1',
        type: 'panel',
        elements: [makeField({ _id: 'nested' })],
      }),
    ];
    expect(findFieldById(fields, 'nested')?._id).toBe('nested');
  });

  it('finds a field deeply nested in multiple panels', () => {
    const fields: FormBuilderField[] = [
      makeField({
        _id: 'p1',
        type: 'panel',
        elements: [
          makeField({
            _id: 'p2',
            type: 'panel',
            elements: [makeField({ _id: 'deep' })],
          }),
        ],
      }),
    ];
    expect(findFieldById(fields, 'deep')?._id).toBe('deep');
  });

  it('returns null for non-existent id', () => {
    const fields: FormBuilderField[] = [makeField({ _id: 'a' })];
    expect(findFieldById(fields, 'nonexistent')).toBeNull();
  });

  it('returns null for empty fields array', () => {
    expect(findFieldById([], 'any')).toBeNull();
  });

  it('distinguishes between root and nested fields with same prefix', () => {
    const fields: FormBuilderField[] = [
      makeField({ _id: 'f1' }),
      makeField({
        _id: 'panel1',
        type: 'panel',
        elements: [makeField({ _id: 'f1-child' })],
      }),
    ];
    expect(findFieldById(fields, 'f1')?._id).toBe('f1');
    expect(findFieldById(fields, 'f1-child')?._id).toBe('f1-child');
  });
});

// ── findFieldLocation ────────────────────────────────────────────────────────────

describe('findFieldLocation', () => {
  it('returns parent array and index for root field', () => {
    const fields: FormBuilderField[] = [makeField({ _id: 'a' }), makeField({ _id: 'b' })];
    const loc = findFieldLocation(fields, 'b');
    expect(loc?.parent).toBe(fields);
    expect(loc?.index).toBe(1);
  });

  it('returns parent and index for nested field', () => {
    const nested = makeField({ _id: 'nested' });
    const fields: FormBuilderField[] = [
      makeField({ _id: 'panel1', type: 'panel', elements: [nested] }),
    ];
    const loc = findFieldLocation(fields, 'nested');
    expect(loc?.parent).toBe(fields[0].elements);
    expect(loc?.index).toBe(0);
  });

  it('returns null for non-existent id', () => {
    expect(findFieldLocation([], 'no')).toBeNull();
  });
});

// ── removeFieldRecursive ─────────────────────────────────────────────────────────

describe('removeFieldRecursive', () => {
  it('removes a field at root level', () => {
    const fields: FormBuilderField[] = [
      makeField({ _id: 'a' }),
      makeField({ _id: 'b' }),
      makeField({ _id: 'c' }),
    ];
    const result = removeFieldRecursive(fields, 'b');
    expect(result).toHaveLength(2);
    expect(result.map((f) => f._id)).toEqual(['a', 'c']);
  });

  it('removes a field from inside a panel', () => {
    const fields: FormBuilderField[] = [
      makeField({ _id: 'root' }),
      makeField({
        _id: 'panel1',
        type: 'panel',
        elements: [
          makeField({ _id: 'inner-a' }),
          makeField({ _id: 'inner-b' }),
        ],
      }),
    ];
    const result = removeFieldRecursive(fields, 'inner-a');
    expect(result).toHaveLength(2);
    const panel = result[1] as FormBuilderField;
    expect(panel.elements).toHaveLength(1);
    expect(panel.elements![0]._id).toBe('inner-b');
  });

  it('returns unchanged array when id not found', () => {
    const fields: FormBuilderField[] = [makeField({ _id: 'a' })];
    const result = removeFieldRecursive(fields, 'nonexistent');
    expect(result).toHaveLength(1);
    expect(result[0]._id).toBe('a');
  });

  it('returns empty array when removing the only element', () => {
    const fields: FormBuilderField[] = [makeField({ _id: 'only' })];
    expect(removeFieldRecursive(fields, 'only')).toEqual([]);
  });

  it('works on empty fields array', () => {
    expect(removeFieldRecursive([], 'any')).toEqual([]);
  });

  it('removes deeply nested field', () => {
    const fields: FormBuilderField[] = [
      makeField({
        _id: 'p1',
        type: 'panel',
        elements: [
          makeField({
            _id: 'p2',
            type: 'panel',
            elements: [makeField({ _id: 'deep' })],
          }),
        ],
      }),
    ];
    const result = removeFieldRecursive(fields, 'deep');
    const outerPanel = result[0] as FormBuilderField;
    const innerPanel = outerPanel.elements![0] as FormBuilderField;
    expect(innerPanel.elements).toEqual([]);
  });

  it('does not mutate the original array', () => {
    const fields: FormBuilderField[] = [makeField({ _id: 'a' }), makeField({ _id: 'b' })];
    const result = removeFieldRecursive(fields, 'a');
    expect(fields).toHaveLength(2); // original unchanged
    expect(result).toHaveLength(1);
  });
});

// ── removeField (non-recursive, root-only) ───────────────────────────────────────

describe('removeField', () => {
  it('removes a field at root level', () => {
    const fields: FormBuilderField[] = [makeField({ _id: 'a' }), makeField({ _id: 'b' })];
    const result = removeField(fields, 'a');
    expect(result).toHaveLength(1);
    expect(result[0]._id).toBe('b');
  });

  it('does NOT remove fields inside panels', () => {
    const fields: FormBuilderField[] = [
      makeField({
        _id: 'panel1',
        type: 'panel',
        elements: [makeField({ _id: 'inner' })],
      }),
    ];
    const result = removeField(fields, 'inner');
    expect(result).toHaveLength(1); // panel still there, inner still there
  });
});

// ── updateField ──────────────────────────────────────────────────────────────────

describe('updateField', () => {
  it('updates a field at root level', () => {
    const fields: FormBuilderField[] = [makeField({ _id: 'a', title: 'Old' })];
    const result = updateField(fields, 'a', { title: 'New' });
    expect(result[0].title).toBe('New');
  });

  it('updates a field inside a panel', () => {
    const fields: FormBuilderField[] = [
      makeField({
        _id: 'panel1',
        type: 'panel',
        elements: [makeField({ _id: 'inner', title: 'Old' })],
      }),
    ];
    const result = updateField(fields, 'inner', { title: 'New' });
    const panel = result[0] as FormBuilderField;
    expect(panel.elements![0].title).toBe('New');
  });

  it('returns unchanged when id not found', () => {
    const fields: FormBuilderField[] = [makeField({ _id: 'a' })];
    const result = updateField(fields, 'nonexistent', { title: 'New' });
    expect(result[0].title).toBe('Test Title');
  });

  it('does not mutate original array', () => {
    const fields: FormBuilderField[] = [makeField({ _id: 'a', title: 'Old' })];
    updateField(fields, 'a', { title: 'New' });
    expect(fields[0].title).toBe('Old');
  });
});

// ── flattenFieldTree ─────────────────────────────────────────────────────────────

describe('flattenFieldTree', () => {
  it('returns flat array for simple fields', () => {
    const fields: FormBuilderField[] = [
      makeField({ _id: 'a' }),
      makeField({ _id: 'b' }),
    ];
    const result = flattenFieldTree(fields);
    expect(result).toHaveLength(2);
  });

  it('includes panel container AND its children in the flat list', () => {
    const fields: FormBuilderField[] = [
      makeField({ _id: 'panel1', type: 'panel', elements: [makeField({ _id: 'inner' })] }),
    ];
    const result = flattenFieldTree(fields);
    expect(result).toHaveLength(2); // panel + child
    expect(result.map((f) => f._id)).toEqual(['panel1', 'inner']);
  });

  it('handles deeply nested panels', () => {
    const fields: FormBuilderField[] = [
      makeField({
        _id: 'p1',
        type: 'panel',
        elements: [
          makeField({
            _id: 'p2',
            type: 'panel',
            elements: [makeField({ _id: 'leaf' })],
          }),
        ],
      }),
    ];
    const result = flattenFieldTree(fields);
    expect(result).toHaveLength(3);
  });
});

// ── validateFields ───────────────────────────────────────────────────────────────

describe('validateFields', () => {
  it('returns empty errors array for valid fields', () => {
    const fields: FormBuilderField[] = [
      makeField({ name: 'valid', title: 'Valid' }),
    ];
    expect(validateFields(fields)).toEqual([]);
  });

  it('reports error for missing name', () => {
    const fields: FormBuilderField[] = [makeField({ name: '', title: 'T' })];
    const errors = validateFields(fields);
    expect(errors).toHaveLength(1);
    expect(errors[0].msg).toBe('Field name is required');
  });

  it('reports error for missing title', () => {
    const fields: FormBuilderField[] = [makeField({ name: 'n', title: '' })];
    const errors = validateFields(fields);
    expect(errors).toHaveLength(1);
    expect(errors[0].msg).toBe('Field title is required');
  });

  it('reports error for dropdown with fewer than 2 choices', () => {
    const fields: FormBuilderField[] = [
      makeField({ name: 'd', title: 'D', type: 'dropdown', choices: ['Only One'] }),
    ];
    const errors = validateFields(fields);
    expect(errors).toHaveLength(1);
    expect(errors[0].msg).toBe('Choice fields must have at least 2 options');
  });

  it('skips choices check when spChoicesSource is provided', () => {
    const fields: FormBuilderField[] = [
      {
        ...makeField({ name: 'd', title: 'D', type: 'dropdown' }),
        choices: ['Only One'],
        spChoicesSource: { list: 'SomeList', column: 'SomeCol' },
      },
    ];
    const errors = validateFields(fields);
    expect(errors).toEqual([]);
  });

  it('reports error for rating with min >= max', () => {
    const fields: FormBuilderField[] = [
      makeField({ name: 'r', title: 'R', type: 'rating', rateMin: 5, rateMax: 3 }),
    ];
    const errors = validateFields(fields);
    expect(errors).toHaveLength(1);
    expect(errors[0].msg).toBe('Rating min must be less than max');
  });

  it('validates fields inside panels recursively', () => {
    const fields: FormBuilderField[] = [
      makeField({
        _id: 'panel1',
        type: 'panel',
        name: '', // panel itself gets checked too (name)
        elements: [makeField({ _id: 'inner', name: '', title: '' })],
      }),
    ];
    const errors = validateFields(fields);
    // panel: name missing; inner: name missing + title missing = 3 total
    expect(errors.length).toBeGreaterThanOrEqual(3);
  });

  it('reports duplicate field names', () => {
    const fields: FormBuilderField[] = [
      makeField({ _id: 'a', name: 'dup', title: 'A' }),
      makeField({ _id: 'b', name: 'dup', title: 'B' }),
    ];
    const errors = validateFields(fields);
    const dupErrors = errors.filter((e) => e.msg.startsWith('Duplicate'));
    expect(dupErrors).toHaveLength(2); // both fields flagged
  });
});

// ── reorderFields ────────────────────────────────────────────────────────────────

describe('reorderFields', () => {
  it('moves a field from one index to another', () => {
    const fields: FormBuilderField[] = [
      makeField({ _id: 'a' }),
      makeField({ _id: 'b' }),
      makeField({ _id: 'c' }),
    ];
    const result = reorderFields(fields, 0, 2);
    expect(result.map((f) => f._id)).toEqual(['b', 'c', 'a']);
  });

  it('handles same from and to index', () => {
    const fields: FormBuilderField[] = [makeField({ _id: 'a' }), makeField({ _id: 'b' })];
    const result = reorderFields(fields, 0, 0);
    expect(result.map((f) => f._id)).toEqual(['a', 'b']);
  });

  it('does not mutate original array', () => {
    const fields: FormBuilderField[] = [makeField({ _id: 'a' }), makeField({ _id: 'b' })];
    reorderFields(fields, 0, 1);
    expect(fields[0]._id).toBe('a'); // original unchanged
  });
});

// ── duplicateField ───────────────────────────────────────────────────────────────

describe('duplicateField', () => {
  it('duplicates a field with modified name, title, and new id', () => {
    const fields: FormBuilderField[] = [
      makeField({ _id: 'a', name: 'original', title: 'Original' }),
      makeField({ _id: 'b' }),
    ];
    const result = duplicateField(fields, 'a');
    expect(result).toHaveLength(3);
    expect(result[1]._id).toMatch(/^field_/);
    expect(result[1]._id).not.toBe('a');
    expect(result[1].name).toBe('original_copy');
    expect(result[1].title).toBe('Original (Copy)');
  });

  it('returns unchanged array when id not found', () => {
    const fields: FormBuilderField[] = [makeField({ _id: 'a' })];
    expect(duplicateField(fields, 'nonexistent')).toHaveLength(1);
  });
});

// ── buildSurveyJson ──────────────────────────────────────────────────────────────

describe('buildSurveyJson', () => {
  it('maps nested dropdown builder props to SurveyJS and strips internal panel props', () => {
    const panel = createQuestion(QUESTION_TYPES.find(t => t.type === 'panel')!);
    const dropdown = createQuestion(QUESTION_TYPES.find(t => t.type === 'dropdown')!);
    panel.elements = [dropdown];

    const json = buildSurveyJson([panel]);
    const panelEl = json.pages[0].elements[0] as Record<string, unknown>;
    const dropdownEl = (panelEl.elements as Record<string, unknown>[])[0];

    expect(panelEl.collapsible).toBeUndefined();
    expect(dropdownEl.searchable).toBeUndefined();
    expect(dropdownEl.clearable).toBeUndefined();
    expect(dropdownEl.searchEnabled).toBe(false);
    expect(dropdownEl.allowClear).toBe(false);
    expect(dropdownEl.renderAs).toBe("select");
  });
});
