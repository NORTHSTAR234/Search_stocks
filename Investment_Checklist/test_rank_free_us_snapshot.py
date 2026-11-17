import unittest
from rank_free_us_snapshot import parse_num,assess,diversified

def fictional(**kw):
    row=dict(ticker='ABC',name='Fictional Co',exchange='NYSE',
             sector='Industrials',industry='Machinery',price='25',mktCap='2000000000',
             pe='12',roce='22',opMargin='18',freeCashFlow='200000000',
             salesGrowth3y='10',debtToEquity='0.3',profitAfterTax='150',
             avgVolume='400000')
    row.update(kw)
    return row

class RankingTests(unittest.TestCase):
    def test_numeric_units(self):
        self.assertEqual(parse_num('3.5B'),3500000000)
        self.assertEqual(parse_num('13.7%'),13.7)
        self.assertIsNone(parse_num('—'))

    def test_industrial_is_preliminary_only(self):
        r=assess(fictional())
        self.assertEqual(r['status'],'QUANT DISCOVERY — FULL CHECKLIST PENDING')
        self.assertIsNotNone(r['discovery_score'])
        self.assertAlmostEqual(r['metrics']['fcf_yield'],10)
        self.assertEqual(r['metrics']['fcf_cash_conversion'],1.33)

    def test_specialists_are_separate(self):
        r=assess(fictional(sector='Financial Services'))
        self.assertIn('SPECIALIST',r['status'])
        self.assertIsNone(r['discovery_score'])

    def test_missing_does_not_turn_into_zero(self):
        r=assess(fictional(freeCashFlow=''))
        self.assertIsNone(r['metrics']['freeCashFlow'])
        self.assertIsNone(r['discovery_score'])

    def test_very_low_pe_warning(self):
        r=assess(fictional(pe='6'))
        self.assertTrue(any('very low' in s for s in r['warnings']))

    def test_cashflow_outlier_quarantined(self):
        r=assess(fictional(freeCashFlow='500000000'))
        self.assertIn('ANOMALOUS',r['status'])
        self.assertIsNone(r['discovery_score'])

    def test_commodity_cycles_not_industrial_compounders(self):
        r=assess(fictional(sector='Basic Materials'))
        self.assertIn('COMMODITY CYCLICAL',r['status'])
        self.assertIsNone(r['discovery_score'])

    def test_negative_book_equity_is_not_low_leverage(self):
        r=assess(fictional(debtToEquity='-3.46'))
        self.assertIn('NEGATIVE BOOK EQUITY',r['status'])
        self.assertIsNone(r['discovery_score'])

    def test_when_issued_security_not_comparable(self):
        r=assess(fictional(name='Fictional Company Common Stock When-Issued'))
        self.assertIn('WHEN-ISSUED',r['status'])
        self.assertIsNone(r['discovery_score'])

    def test_extreme_growth_is_research_cohort_not_qualified(self):
        r=assess(fictional(salesGrowth3y='105'))
        self.assertIn('EXTREME GROWTH',r['status'])
        self.assertIsNone(r['discovery_score'])

    def test_sector_caps(self):
        r1=assess(fictional(ticker='A'))
        r2=assess(fictional(ticker='B'))
        r3=assess(fictional(ticker='C',sector='Healthcare'))
        self.assertEqual([r['ticker'] for r in diversified([r1,r2,r3],3,1)],['A','C'])

if __name__=='__main__':unittest.main()
