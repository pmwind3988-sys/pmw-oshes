import { describe, expect, it } from 'vitest';

import { annotateGraphCollectionFields } from './graphClient.ts';

describe('annotateGraphCollectionFields', () => {
  it('declares the collection type for multi-choice values', () => {
    expect(annotateGraphCollectionFields({ natureOfWork: ['hotWork', 'confinedSpace'] })).toEqual({
      'natureOfWork@odata.type': 'Collection(Edm.String)',
      natureOfWork: ['hotWork', 'confinedSpace'],
    });
  });

  it('leaves scalar values alone', () => {
    const fields = {
      SubmittedBy: 'GUEST',
      noOfWorker: 4,
      PDPAConsent: 'Accepted',
      SubmittedAt: '2026-08-04T02:49:42.000Z',
    };
    expect(annotateGraphCollectionFields(fields)).toEqual(fields);
  });

  it('annotates an empty selection so the column is cleared rather than rejected', () => {
    expect(annotateGraphCollectionFields({ typeOfPPEUseavailable: [] })).toEqual({
      'typeOfPPEUseavailable@odata.type': 'Collection(Edm.String)',
      typeOfPPEUseavailable: [],
    });
  });

  it('sends collection entries as strings', () => {
    expect(annotateGraphCollectionFields({ scores: [1, 2] })).toEqual({
      'scores@odata.type': 'Collection(Edm.String)',
      scores: ['1', '2'],
    });
  });
});
