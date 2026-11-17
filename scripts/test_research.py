import copy
import unittest
from validate_research import read, validate_research, validate_support_comparisons


class ResearchTests(unittest.TestCase):
    def setUp(self):
        self.r = read('research')

    def reject(self, mutate):
        r = copy.deepcopy(self.r)
        mutate(r)
        with self.assertRaises(ValueError):
            validate_research(r)

    def test_tree_candidate_reference(self):
        self.reject(lambda r:r['problemTree'][0].update(candidateId='missing'))

    def test_tree_translation(self):
        self.reject(lambda r:r['problemTree'][0]['scene'].pop('en'))

    def test_no_unsupported_business_point(self):
        self.reject(lambda r:r['businessIdeas'][0].update(margin=0.5))

    def test_business_coverage(self):
        self.reject(lambda r:r['businessIdeas'].pop())

    def test_vision_translation(self):
        self.reject(lambda r:r['vision'].pop('en'))

    def test_existing_means_translation(self):
        self.reject(lambda r:r['candidates'][0]['existingMeans'].pop('en'))

    def test_overview_fields(self):
        self.reject(lambda r:r['candidates'][0]['overview'].pop('scale'))

    def test_overview_translation(self):
        self.reject(lambda r:r['candidates'][0]['overview']['gap'].pop('en'))

    def test_overview_evidence_reference(self):
        self.reject(lambda r:r['candidates'][0]['overviewEvidenceIds']['scale'].append('missing'))

    def test_overview_evidence_coverage(self):
        self.reject(lambda r:r['candidates'][0]['overviewEvidenceIds'].pop('scale'))

    def test_support_comparisons(self):
        data = read('competitors')
        ids = {row['id'] for name in ('visits', 'precare', 'seminar') for row in read(name)['rows']}
        validate_support_comparisons(data, ids)
        for mutate in (
            lambda d: d['comparisons'].pop('discharge'),
            lambda d: d['comparisons']['appointments']['optionIds'].append('missing'),
            lambda d: d['options'][0]['referenceIds'].append('missing'),
            lambda d: d['options'][0]['coordination'].pop('en'),
            lambda d: d['options'][0].update(status='confirmed-booking'),
            lambda d: d['comparisons']['respite']['columns'].pop(),
            lambda d: d['options'][0]['provision'].update(state='pilot'),
            lambda d: d['options'][1]['provision'].update(checkedOn=None),
            lambda d: d['comparisons']['appointments']['optionIds'].pop(),
            lambda d: d['options'][0]['provision']['referenceIds'].append('missing'),
            lambda d: d['options'][-2]['provision'].update(state='offered', checkedOn='2026-11-17'),
        ):
            broken = copy.deepcopy(data)
            mutate(broken)
            with self.assertRaises(ValueError):
                validate_support_comparisons(broken, ids)

    def test_valid(self):
        validate_research(self.r)

    def test_broken_evidence_reference(self):
        self.reject(lambda r:r['findings'][0]['evidenceIds'].append('missing'))

    def test_no_selection(self):
        self.reject(lambda r:r.update(selectedCandidateId='appointments'))

    def test_no_selected_problem(self):
        self.reject(lambda r:r.update(selectedProblemId='planned-accompaniment'))

    def test_duplicate_cell(self):
        self.reject(lambda r:r['placements'].append(copy.deepcopy(r['placements'][0])))

    def test_incomplete_translation(self):
        self.reject(lambda r:r['findings'][0]['compare'].pop('en'))

    def test_empty_translation(self):
        self.reject(lambda r:r['origin'].update(en=''))

    def test_not_completed(self):
        self.reject(lambda r:r.update(status='completed'))

    def test_missing_axis(self):
        self.reject(lambda r:r['candidates'][0]['cells'].pop('risk'))

    def test_interpretation_separate(self):
        self.reject(lambda r:r['candidates'][0]['cells']['impact'].update(interpretation={'ja':'解釈'}))

    def test_flow_not_a_result(self):
        self.reject(lambda r:r['flow'].update(status='confirmed'))

    def test_missing_candidate(self):
        self.reject(lambda r:r['candidates'].pop())

    def test_missing_alternative_axis(self):
        self.reject(lambda r:r['alternatives'][0]['cells'].pop('timing'))

    def test_alternative_cell_translation(self):
        self.reject(lambda r:r['alternatives'][0]['cells']['preference'].pop('en'))

    def test_missing_alternative(self):
        self.reject(lambda r:r['alternatives'].pop())

    def test_no_copied_evidence(self):
        self.reject(lambda r:r['findings'][0].update(result={'ja':'copy','en':'copy'}))

    def test_unplaced_not_hidden(self):
        self.reject(lambda r:r['unplaced'].pop())

    def test_no_forced_assignment(self):
        self.reject(lambda r:r['placements'][0].update(stage='unspecified'))

    def test_comparison_required(self):
        self.reject(lambda r:r['findings'][0].update(evidenceIds=['E08']))


if __name__ == '__main__':
    unittest.main()
