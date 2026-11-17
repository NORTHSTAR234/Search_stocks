import csv
import tempfile
import unittest
from pathlib import Path
from import_market_csv import main, canonical


class ImporterTests(unittest.TestCase):
    def test_symbols_and_provider_suffixes(self):
        self.assertEqual(canonical('NVDA', 'US'), 'NVDA')
        self.assertEqual(canonical('1519', 'TWSE'), '1519.TWSE')
        self.assertEqual(canonical('BHP.ASX', 'ASX'), 'BHP.ASX')
        self.assertEqual(canonical('CBHC', 'MYX'), 'CBHC.MYX')
        with self.assertRaises(ValueError):
            canonical('BHP.AX', 'ASX')

    def test_three_year_roic_and_no_fake_qualification(self):
        with tempfile.TemporaryDirectory() as d:
            fn = Path(d) / 'test.csv'
            with fn.open('w', newline='') as f:
                w = csv.DictWriter(f, fieldnames=[
                    'ticker','company','fy','report_currency','revenue',
                    'ebit','cfo','capex','equity','interest_debt','cash',
                    'source_url','source_date'])
                w.writeheader()
                for fy in (2023, 2024, 2025, 2026):
                    w.writerow(dict(
                        ticker='ABC', company='Hypothetical Ltd', fy=fy,
                        report_currency='AUD', revenue=400, ebit=100, cfo=90,
                        capex=10, equity=200, interest_debt=50, cash=50,
                        source_url='https://example.test/financials',
                        source_date=f'{fy}-08-01'))
            out = main([str(fn), '--market', 'ASX', '--tax-rate', '0.30'])
            self.assertEqual(out['unique_issuers'], 1)
            self.assertFalse(out['universe_exhaustive'])
            c = out['companies'][0]
            self.assertTrue(c['three_year_roic_complete'])
            self.assertEqual(c['roic_years_computed'], 3)
            self.assertEqual(c['annual'][-1]['indicative_roic_pct'], 35.0)
            self.assertIsNone(c['annual'][-1]['indicative_fcf_after_leases'])
            self.assertEqual(c['screening_status'], 'DISCOVERY ONLY / NOT INVESTMENT QUALIFIED')

    def test_unstated_tax_rate_does_not_generate_roic(self):
        with tempfile.TemporaryDirectory() as d:
            fn = Path(d) / 'test.csv'
            fn.write_text('ticker,fy,report_currency,ebit,equity,interest_debt,cash,source_url,source_date\n'
                          'X,2025,USD,10,100,50,10,https://example.test/1,2026-01-01\n'
                          'X,2026,USD,11,100,50,10,https://example.test/2,2026-10-01\n')
            out = main([str(fn), '--market', 'US'])
            self.assertIsNone(out['companies'][0]['annual'][-1]['indicative_roic_pct'])


if __name__ == '__main__':
    unittest.main()
