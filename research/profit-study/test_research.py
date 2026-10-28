import unittest,math
from analyze import feature_rows,roundtrip,qualifies,simulate
class ResearchTests(unittest.TestCase):
 def rows(self,n=240):
  return [[i*3600,100*1.002**i,100*1.002**i*1.003,100*1.002**i*.997,100*1.002**i*1.001,1000+i] for i in range(n)]
 def test_fees_and_slippage_reduce_flat_price_trade(self):
  self.assertAlmostEqual(roundtrip(100,100,.009,.001),10*(.999/1.001)*.991-10*1.009)
  self.assertLess(roundtrip(100,100,.009,.001),-.19)
 def test_stress_slippage_cannot_improve_same_round_trip(self):
  self.assertLess(roundtrip(100,105,.009,.0025),roundtrip(100,105,.009,.001))
 def test_no_signal_before_required_history(self):
  self.assertEqual(feature_rows(self.rows(168)),{})
  self.assertEqual(len(feature_rows(self.rows(169))),1)
 def test_future_prices_cannot_change_past_features(self):
  rows=self.rows();first=feature_rows(rows)
  later=[r[:] for r in rows]
  for r in later[220:]:
   for k in range(1,5):r[k]*=2
  second=feature_rows(later)
  self.assertEqual({t:f for t,f in first.items() if t<220*3600},{t:f for t,f in second.items() if t<220*3600})
 def test_real_gaps_reset_history_without_forward_filling(self):
  rows=self.rows(400);del rows[200]
  features=feature_rows(rows)
  self.assertNotIn(201*3600,features)
  self.assertIn(369*3600,features)
 def test_invalid_ohlc_rejected(self):
  rows=self.rows();rows[10][2]=0
  with self.assertRaises(ValueError):feature_rows(rows)
 def test_market_filter_rejects_negative_btc(self):
  self.assertFalse(qualifies('momentum',{}, {'ret24':-.01}))
 def test_one_position_and_no_entry_before_signal(self):
  rows=self.rows(300);bars={s:{r[0]:r for r in rows} for s in ['BTC-USD','ETH-USD']};features={s:feature_rows(rows) for s in bars}
  result=simulate('momentum',list(bars),168*3600,300*3600,.009,.001,bars,features)
  self.assertGreater(result['trades'],0)
  for trade in result['ledger']:self.assertGreaterEqual(trade['entry_time'],169*3600)
  for prev,nxt in zip(result['ledger'],result['ledger'][1:]):self.assertLessEqual(prev['exit_time'],nxt['entry_time'])
 def test_no_opportunities_retains_cash(self):
  result=simulate('momentum',[],0,10*3600,.009,.001,{}, {'BTC-USD':{}})
  self.assertEqual(result['trades'],0);self.assertEqual(result['pnl_usd'],0)
if __name__=='__main__':unittest.main()
