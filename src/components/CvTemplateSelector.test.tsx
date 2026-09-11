import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CvTemplateSelector from './CvTemplateSelector';

const mocks = vi.hoisted(() => ({
  apiCall: vi.fn(),
  normalizeMasterData: vi.fn(),
  renderTemplate: vi.fn(),
  loadExcelTemplate: vi.fn(),
  loadDocxTemplate: vi.fn(),
  loadPdfTemplate: vi.fn(),
  listTemplates: vi.fn(() => []),
}));

vi.mock('../lib/apiClient', () => ({
  default: { call: (...args: unknown[]) => mocks.apiCall(...args) },
}));

vi.mock('../lib/cv-template-factory', () => ({
  cvFactory: { list: mocks.listTemplates, render: mocks.renderTemplate },
  normalizeMasterData: mocks.normalizeMasterData,
  loadExcelTemplate: mocks.loadExcelTemplate,
  loadDocxTemplate: mocks.loadDocxTemplate,
  loadPdfTemplate: mocks.loadPdfTemplate,
}));

vi.mock('../store/i18n', () => ({ t: (key: string) => key }));
vi.mock('./ui/Icon', () => ({ default: () => null }));

const draft = { success: true, data: { nama_lengkap: 'Budi' } };
const normalized = {
  identitas: {},
  fisik: {},
  medis: {},
  pendidikan: [],
  pekerjaan: [],
  keluarga: [],
  sertifikasi: {},
  wawancara: {},
  kenalan_jepang: {},
  uploads: {},
  raw: {},
};

let clickSpy: ReturnType<typeof vi.spyOn>;
let downloads: Array<{ href: string; download: string }>;

function fileInput() {
  return document.querySelector('input[type="file"]') as HTMLInputElement;
}

function renderSelector() {
  render(
    <CvTemplateSelector
      waTarget="6281234567890"
      isAdmin={false}
      onClose={vi.fn()}
    />,
  );
}

async function chooseFile(file: File) {
  fireEvent.change(fileInput(), { target: { files: [file] } });
  await waitFor(() => expect(screen.getByText(file.name)).toBeTruthy());
  expect(screen.getByRole('button', { name: 'Generate dengan Template Kustom' })).toBeTruthy();
}

describe('CvTemplateSelector custom template upload', () => {
  beforeEach(() => {
    mocks.apiCall.mockReset();
    mocks.normalizeMasterData.mockReset();
    mocks.renderTemplate.mockReset();
    mocks.loadExcelTemplate.mockReset();
    mocks.loadDocxTemplate.mockReset();
    mocks.loadPdfTemplate.mockReset();
    mocks.listTemplates.mockReset();
    mocks.apiCall.mockResolvedValue(draft);
    mocks.normalizeMasterData.mockReturnValue(normalized);
    mocks.renderTemplate.mockResolvedValue({
      success: true,
      mimeType: 'application/pdf',
      fileName: 'cv.pdf',
      blob: new Blob(['cv']),
    });
    mocks.loadExcelTemplate.mockResolvedValue(
      new Blob(['xlsx'], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    );
    mocks.loadDocxTemplate.mockResolvedValue({ html: '<p>Budi</p>', text: 'Budi' });
    mocks.loadPdfTemplate.mockResolvedValue('Budi');
    downloads = [];
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      downloads.push({ href: this.href, download: this.download });
    });
  });

  afterEach(() => {
    cleanup();
    clickSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it('selects an xlsx template, loads draft data, and downloads the generated workbook', async () => {
    renderSelector();
    const file = new File(['template'], 'candidate.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    await chooseFile(file);
    expect(fileInput().accept).toBe('.docx,.xlsx,.pdf');
    fireEvent.click(screen.getByRole('button', { name: 'Generate dengan Template Kustom' }));

    await waitFor(() => expect(mocks.apiCall).toHaveBeenCalledTimes(1));
    expect(mocks.apiCall).toHaveBeenCalledWith('getDrafCvMaster', ['6281234567890']);
    expect(mocks.normalizeMasterData).toHaveBeenCalledWith(draft);
    expect(mocks.loadExcelTemplate).toHaveBeenCalledWith(file, normalized);
    expect(mocks.loadDocxTemplate).not.toHaveBeenCalled();
    expect(mocks.loadPdfTemplate).not.toHaveBeenCalled();
    expect(downloads).toEqual([{ href: 'blob:test', download: 'candidate_generated.xlsx' }]);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test');
    await waitFor(() => expect(screen.queryByText(file.name)).toBeNull());
  });

  it('converts a docx template to a downloadable HTML file', async () => {
    renderSelector();
    const file = new File(['template'], 'template.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });

    await chooseFile(file);
    fireEvent.click(screen.getByRole('button', { name: 'Generate dengan Template Kustom' }));

    await waitFor(() => expect(mocks.loadDocxTemplate).toHaveBeenCalledTimes(1));
    expect(mocks.loadDocxTemplate).toHaveBeenCalledWith(file, normalized);
    const output = vi.mocked(URL.createObjectURL).mock.calls[0][0] as Blob;
    expect(output.type).toBe('text/html');
    expect(downloads).toEqual([{ href: 'blob:test', download: 'template_generated.html' }]);
  });

  it('converts a pdf template to a downloadable text file', async () => {
    renderSelector();
    const file = new File(['template'], 'template.pdf', { type: 'application/pdf' });

    await chooseFile(file);
    fireEvent.click(screen.getByRole('button', { name: 'Generate dengan Template Kustom' }));

    await waitFor(() => expect(mocks.loadPdfTemplate).toHaveBeenCalledTimes(1));
    expect(mocks.loadPdfTemplate).toHaveBeenCalledWith(file, normalized);
    const output = vi.mocked(URL.createObjectURL).mock.calls[0][0] as Blob;
    expect(output.type).toBe('text/plain');
    expect(downloads).toEqual([{ href: 'blob:test', download: 'template_generated.txt' }]);
  });

  it('rejects unsupported extensions before calling the draft API', async () => {
    renderSelector();
    const file = new File(['not supported'], 'template.txt', { type: 'text/plain' });

    await chooseFile(file);
    fireEvent.click(screen.getByRole('button', { name: 'Generate dengan Template Kustom' }));

    await waitFor(() => expect(screen.getByText('Tipe file tidak didukung. Gunakan .docx, .xlsx, atau .pdf')).toBeTruthy());
    expect(mocks.apiCall).not.toHaveBeenCalled();
    expect(mocks.loadExcelTemplate).not.toHaveBeenCalled();
    expect(mocks.loadDocxTemplate).not.toHaveBeenCalled();
    expect(mocks.loadPdfTemplate).not.toHaveBeenCalled();
  });
});
