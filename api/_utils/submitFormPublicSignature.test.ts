import { describe, expect, it, vi } from 'vitest';

import { __test__ } from '../submit-form.ts';

const SIGNATURE_DATA_URI = 'data:image/png;base64,aGVsbG8=';
const SIGNATURE_URL = 'https://pmwgroupcom.sharepoint.com/sites/PMWHRDocs/Signature%20Images/signature.png';

describe('public form signature submission', () => {
  it('ensures signature image storage with the system app before uploading public signatures', async () => {
    const deps = {
      listExistsGraph: vi.fn(async () => false),
      ensureDocLibrary: vi.fn(async () => 'Signature Images'),
    };
    const context = {
      token: 'system-token',
      listTitle: 'Leave Application',
      uploadLibraryByUse: {} as Record<string, string | null>,
      uploadDataUri: vi.fn(async () => ({ url: SIGNATURE_URL, fileName: 'signature.png' })),
      uploadLibraryDeps: deps,
      uploadedFiles: [],
    };

    await expect(__test__.resolveExistingUploadLibrary(context, 'signature')).resolves.toBe('Signature Images');

    expect(deps.ensureDocLibrary).toHaveBeenCalledWith('system-token', 'Signature Images');
    expect(deps.listExistsGraph).not.toHaveBeenCalled();
    expect(context.uploadLibraryByUse.signature).toBe('Signature Images');
  });

  it('falls back to the per-form public upload library if the global signature library cannot be ensured', async () => {
    const deps = {
      listExistsGraph: vi.fn(async (_token: string, displayName: string) => displayName === 'Leave Application Files'),
      ensureDocLibrary: vi.fn(async () => {
        throw new Error('library creation denied');
      }),
    };
    const context = {
      token: 'system-token',
      listTitle: 'Leave Application',
      uploadLibraryByUse: {} as Record<string, string | null>,
      uploadDataUri: vi.fn(async () => ({ url: SIGNATURE_URL, fileName: 'signature.png' })),
      uploadLibraryDeps: deps,
      uploadedFiles: [],
    };

    await expect(__test__.resolveExistingUploadLibrary(context, 'signature')).resolves.toBe('Leave Application Files');

    expect(deps.ensureDocLibrary).toHaveBeenCalledWith('system-token', 'Signature Images');
    expect(deps.listExistsGraph).toHaveBeenCalledWith('system-token', 'Leave Application Files');
    expect(context.uploadLibraryByUse.signature).toBe('Leave Application Files');
  });

  it('uploads signaturepad data and defers the SharePoint URL field write', async () => {
    const schema = __test__.collectSubmissionSchema({
      pages: [
        {
          elements: [
            { type: 'text', name: 'EmployeeName' },
            { type: 'signaturepad', name: 'EmployeeSignature' },
          ],
        },
      ],
    });
    const uploadDataUri = vi.fn(async () => ({
      url: SIGNATURE_URL,
      fileName: 'signature.png',
    }));

    const result = await __test__.buildSubmissionFields(
      'token',
      'Leave Application',
      {
        EmployeeName: 'Avery',
        EmployeeSignature: SIGNATURE_DATA_URI,
      },
      {
        CurrentVersion: '3.1',
        FormID: 'FORM-001',
      },
      schema,
      { uploadDataUri },
    );

    expect(result.fields.EmployeeName).toBe('Avery');
    expect(result.fields.EmployeeSignature).toBeUndefined();
    expect(JSON.parse(String(result.fields.RawJSON))).toMatchObject({
      EmployeeName: 'Avery',
      EmployeeSignature: SIGNATURE_URL,
    });
    expect(result.urlFieldPatches).toEqual([
      {
        fieldName: 'EmployeeSignature',
        url: SIGNATURE_URL,
        description: 'Signature',
        graphValue: `${SIGNATURE_URL}, Signature`,
      },
    ]);
    expect(uploadDataUri).toHaveBeenCalledTimes(1);
    const uploadCalls = uploadDataUri.mock.calls as unknown[][];
    expect(uploadCalls[0]?.[4]).toBe('signature');
  });

  it('stores public form datetimes as Malaysia local wall-clock values for SharePoint', async () => {
    const schema = __test__.collectSubmissionSchema({
      pages: [
        {
          elements: [
            { type: 'text', inputType: 'datetime-local', name: 'starttime' },
            { type: 'text', inputType: 'datetime-local', name: 'endtime' },
          ],
        },
      ],
    });

    const result = await __test__.buildSubmissionFields(
      'token',
      'Overtime Request',
      {
        starttime: '2026-06-22T10:00',
        endtime: '2026-06-22T18:00',
      },
      {
        CurrentVersion: '1.0',
        FormID: 'FORM-OT',
      },
      schema,
    );

    expect(result.fields.starttime).toBe('2026-06-22T02:00:00.000Z');
    expect(result.fields.endtime).toBe('2026-06-22T10:00:00.000Z');
  });

  it('patches signature URL fields through SharePoint REST FieldUrlValue', async () => {
    const deps = {
      getSharePointToken: vi.fn(async () => 'sharepoint-token'),
      patchHyperlinkViaSPRest: vi.fn(async () => undefined),
    };

    await expect(
      __test__.applyUrlFieldPatches(
        'Training Requisition Form',
        '42',
        [{
          fieldName: 'applicantSignature',
          url: SIGNATURE_URL,
          description: 'Signature',
          graphValue: `${SIGNATURE_URL}, Signature`,
        }],
        (fieldName) => fieldName === 'applicantSignature' ? 'Applicant_x0020_Signature' : null,
        deps,
      ),
    ).resolves.toBeUndefined();

    expect(deps.getSharePointToken).toHaveBeenCalledTimes(1);
    expect(deps.patchHyperlinkViaSPRest).toHaveBeenCalledWith(
      'sharepoint-token',
      'Training Requisition Form',
      '42',
      'Applicant_x0020_Signature',
      SIGNATURE_URL,
      'Signature',
    );
  });

  it('fails submission when SharePoint REST rejects the actual signature field patch', async () => {
    const deps = {
      getSharePointToken: vi.fn(async () => 'sharepoint-token'),
      patchHyperlinkViaSPRest: vi.fn(async () => {
        throw new Error('SP REST FieldUrlValue rejected');
      }),
    };

    await expect(
      __test__.applyUrlFieldPatches(
        'Training Requisition Form',
        '42',
        [{
          fieldName: 'applicantSignature',
          url: SIGNATURE_URL,
          description: 'Signature',
          graphValue: `${SIGNATURE_URL}, Signature`,
        }],
        () => 'applicantSignature',
        deps,
      ),
    ).rejects.toThrow('Could not save uploaded image link to "applicantSignature"');
  });

  it('deletes the core-created response when any submitted field patch fails', async () => {
    const deps = {
      createListItem: vi.fn()
        .mockRejectedValueOnce(new Error('Graph POST /items 400: {"error":{"code":"invalidRequest"}}'))
        .mockResolvedValueOnce({ id: '29' }),
      updateListItemFields: vi.fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('Graph PATCH fields 400: invalidRequest')),
      deleteListItem: vi.fn(async () => undefined),
    };

    await expect(
      __test__.createResponseItem(
        'graph-token',
        'Training Requisition Form',
        {
          SubmittedAt: '2026-06-16T07:25:00.000Z',
          SubmittedBy: 'GUEST',
          applicantName: 'Avery',
          applicantSignature: `${SIGNATURE_URL}, Signature`,
        },
        deps,
      ),
    ).rejects.toThrow('Could not save submitted field "applicantSignature"');

    expect(deps.deleteListItem).toHaveBeenCalledWith('graph-token', 'Training Requisition Form', '29');
  });

  it('fails submission when the published response list has no matching signature column', async () => {
    await expect(
      __test__.applyUrlFieldPatches(
        'Training Requisition Form',
        '42',
        [{
          fieldName: 'applicantSignature',
          url: SIGNATURE_URL,
          description: 'Signature',
          graphValue: `${SIGNATURE_URL}, Signature`,
        }],
        () => null,
      ),
    ).rejects.toThrow('The public form signature field "applicantSignature" is not provisioned');
  });
});
