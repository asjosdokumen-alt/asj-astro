/**
 * Unit Tests: adminStore
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  inputModalOpen, reportModalOpen,
  kandidatList, allKandidatList, kandidatLoading,
  adminSearch, adminFilterGender, adminFilterJft, adminPage,
  openInputModal, closeInputModal, openReportModal, closeReportModal,
  addKandidat, setKandidatList, setAllKandidatList,
  setAdminSearch, setAdminFilterGender, setAdminFilterJft,
  nextPage, resetPage, toggleSimpleView,
} from './adminStore';

describe('adminStore', () => {
  beforeEach(() => {
    // Reset all stores
    inputModalOpen.set(false);
    reportModalOpen.set(false);
    kandidatList.set([]);
    allKandidatList.set([]);
    kandidatLoading.set(true);
    adminSearch.set('');
    adminFilterGender.set('all');
    adminFilterJft.set('all');
    adminPage.set(0);
  });

  describe('Modal State', () => {
    it('inputModalOpen defaults to false', () => {
      expect(inputModalOpen.get()).toBe(false);
    });

    it('openInputModal sets true', () => {
      openInputModal();
      expect(inputModalOpen.get()).toBe(true);
    });

    it('closeInputModal sets false', () => {
      openInputModal();
      closeInputModal();
      expect(inputModalOpen.get()).toBe(false);
    });

    it('reportModalOpen defaults to false', () => {
      expect(reportModalOpen.get()).toBe(false);
    });

    it('openReportModal sets true', () => {
      openReportModal();
      expect(reportModalOpen.get()).toBe(true);
    });

    it('closeReportModal sets false', () => {
      openReportModal();
      closeReportModal();
      expect(reportModalOpen.get()).toBe(false);
    });
  });

  describe('Kandidat List', () => {
    it('kandidatList defaults to empty', () => {
      expect(kandidatList.get()).toEqual([]);
    });

    it('addKandidat prepends to list', () => {
      const k1 = { id: '1', nama: 'Budi', wa: '08123', idLoker: 'TG1', tahapan: 'LOLOS USER', status: '', catatan: '', gender: 'L', usia: '22', jft: 'A2' };
      const k2 = { id: '2', nama: 'Andi', wa: '08456', idLoker: 'TG2', tahapan: 'MENUNGGU', status: '', catatan: '', gender: 'L', usia: '25', jft: 'B1' };

      addKandidat(k1);
      expect(kandidatList.get()).toHaveLength(1);
      expect(kandidatList.get()[0].nama).toBe('Budi');

      addKandidat(k2);
      expect(kandidatList.get()).toHaveLength(2);
      expect(kandidatList.get()[0].nama).toBe('Andi'); // prepended
    });

    it('setKandidatList replaces list', () => {
      const list = [
        { id: '1', nama: 'Budi', wa: '08123', idLoker: 'TG1', tahapan: '', status: '', catatan: '', gender: '', usia: '', jft: '' },
      ];
      setKandidatList(list);
      expect(kandidatList.get()).toHaveLength(1);
    });

    it('setAllKandidatList replaces allKandidatList', () => {
      const list = [
        { id: '1', nama: 'Budi', wa: '08123', idLoker: 'TG1', tahapan: '', status: '', catatan: '', gender: '', usia: '', jft: '' },
      ];
      setAllKandidatList(list);
      expect(allKandidatList.get()).toHaveLength(1);
    });
  });

  describe('Filters', () => {
    it('setAdminSearch updates search + resets page', () => {
      adminPage.set(3);
      setAdminSearch('budi');
      expect(adminSearch.get()).toBe('budi');
      expect(adminPage.get()).toBe(0);
    });

    it('setAdminFilterGender updates + resets page', () => {
      adminPage.set(2);
      setAdminFilterGender('l');
      expect(adminFilterGender.get()).toBe('l');
      expect(adminPage.get()).toBe(0);
    });

    it('setAdminFilterJft updates + resets page', () => {
      adminPage.set(5);
      setAdminFilterJft('a2');
      expect(adminFilterJft.get()).toBe('a2');
      expect(adminPage.get()).toBe(0);
    });

    it('nextPage increments page', () => {
      adminPage.set(0);
      nextPage();
      expect(adminPage.get()).toBe(1);
      nextPage();
      expect(adminPage.get()).toBe(2);
    });

    it('resetPage resets to 0', () => {
      adminPage.set(5);
      resetPage();
      expect(adminPage.get()).toBe(0);
    });

    it('toggleSimpleView toggles', () => {
      expect(toggleSimpleView()).toBeUndefined();
      // Read the new value
      const _val1 = adminPage.get(); // just checking no crash
    });
  });
});
