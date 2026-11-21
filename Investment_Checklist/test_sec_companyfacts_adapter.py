"""Offline tests for SEC adapter; all fixtures are synthetic."""
import csv
import json
import tempfile
import unittest
from pathlib import Path

from sec_companyfacts_adapter import (
    anchors, annual_fact, main, roster_rows, to_rows
)

def fact(fy,val,kind='duration',form='10-K',fp='FY',filed=None):
    a=f'0000000123-{fy%100:02d}-000001'
    out={'end':f'{fy}-12-31','val':val,'form':form,'fp':fp,
         'fy':fy,'accn':a,'filed':filed or f'{fy+1}-02-01'}
    if kind=='duration':
        out['start']=f'{fy}-01-01'
    return out

def sample_company(cik=123,years=(2023,2024,2025,2026)):
    tags={}
    for tag,v,dur in (
        ('RevenueFromContractWithCustomerExcludingAssessedTax',100.0,True),
        ('OperatingIncomeLoss',25.0,True),
        ('NetCashProvidedByUsedInOperatingActivities',30.0,True),
        ('PaymentsToAcquirePropertyPlantAndEquipment',5.0,True),
        ('StockholdersEquity',60.0,False),
        ('CashAndCashEquivalentsAtCarryingValue',10.0,False),
        ('LongTermDebtNoncurrent',35.0,False),
        ('LongTermDebtCurrent',5.0,False),
        ('OperatingLeaseLiabilityCurrent',2.0,False),
        ('OperatingLeaseLiabilityNoncurrent',8.0,False),
    ):
        tags[tag]={'units':{'USD':[fact(fy,v,'duration' if dur else 'instant') for fy in years]}}
    tags['OperatingIncomeLoss']['units']['USD'].append(
        dict(fact(2026,999.0),start='2026-10-01',form='10-Q',fp='Q4'))
    return {'cik':cik,'entityName':'Fictional Corp','facts':{'us-gaap':tags}}

class SECAdapterTests(unittest.TestCase):
    def test_roster_nyse_nasdaq_only_and_share_classes(self):
        data={'fields':['cik','name','ticker','exchange'],
              'data':[[123,'Fictional Corp','AAA','Nasdaq'],
                      [123,'Fictional Corp','AAB','Nasdaq'],
                      [456,'Company B','BBB','NYSE'],
                      [789,'OTC C','CCC','OTC']]}
        self.assertEqual({x['ticker'] for x in roster_rows(data)},{'AAA','AAB','BBB'})

    def test_reconstructs_only_10k_annual_facts(self):
        c=sample_company()
        rows,gaps=to_rows(c,'AAA','Fictional Corp',4)
        self.assertEqual(len(rows),4)
        self.assertEqual(rows[-1]['fy'],2026)
        self.assertEqual(rows[-1]['ebit'],25.0)
        self.assertEqual(rows[-1]['cfo'],30.0)
        self.assertEqual(rows[-1]['interest_debt'],40.0)
        self.assertEqual(rows[-1]['lease_liabilities'],10.0)
        self.assertIsNone(rows[-1]['lease_principal'])
        self.assertEqual(rows[-1]['source_date'],'2027-02-01')
        self.assertIn('0000000123-26-000001-index.html',rows[-1]['source_url'])

    def test_missing_debt_is_unknown(self):
        c=sample_company()
        del c['facts']['us-gaap']['LongTermDebtCurrent']
        rows,gaps=to_rows(c,'AAA','Fictional Corp',3)
        self.assertIsNone(rows[-1]['interest_debt'])
        self.assertIn({'ticker':'AAA','fy':2026,'field':'interest_debt'},gaps)

    def test_full_offline_cli_counts_duplicate_class_and_missing(self):
        with tempfile.TemporaryDirectory() as d:
            d=Path(d)
            roster={'fields':['cik','name','ticker','exchange'],
                    'data':[[123,'Fictional Corp','AAA','Nasdaq'],
                            [123,'Fictional Corp','AAB','Nasdaq'],
                            [456,'Other Corp','BBB','NYSE']]}
            (d/'roster.json').write_text(json.dumps(roster))
            facts=d/'facts'
            facts.mkdir()
            (facts/'CIK0000000123.json').write_text(json.dumps(sample_company()))
            audit=main(['--roster',str(d/'roster.json'),'--facts-dir',str(facts),
                        '--tickers','AAA,AAB,BBB,NOTLISTED','--out',str(d/'out.csv'),
                        '--audit',str(d/'audit.json'),'--years','4'])
            self.assertEqual(audit['issuers_with_annual_rows'],1)
            self.assertEqual(audit['annual_rows_emitted'],4)
            self.assertEqual(audit['requested_symbols_not_in_sec_roster'],['NOTLISTED'])
            self.assertEqual(audit['duplicate_share_class_symbols'],['AAB'])
            self.assertFalse(audit['coverage_exhaustive'])
            with (d/'out.csv').open(newline='') as f:
                rows=list(csv.DictReader(f))
                self.assertEqual(len(rows),4)
                self.assertEqual(rows[0]['ticker'],'AAA')

if __name__=='__main__':
    unittest.main()
