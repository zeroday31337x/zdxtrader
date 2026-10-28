import unittest
from study import features,simulate

class TypeTests(unittest.TestCase):
    def frame(self,low=99):
        bars={'BTC-USD':{},'TEST-USD':{3600:[3600,101,104,low,102,1],7200:[7200,103,104,102,103,1]}}
        F={'BTC-USD':{},'TEST-USD':{0:{'close':100,'rsi':31,'previous_rsi':29,'ret24':-.1},3600:{'close':102,'rsi':65,'previous_rsi':31,'ret24':-.08}}}
        return bars,F

    def test_market_next_open_and_both_fees(self):
        b,f=self.frame();r=simulate('rsi_rebound',['TEST-USD'],3600,10800,b,f)
        self.assertEqual(r['trades'],1)
        self.assertEqual(r['ledger'][0]['entry_time'],3600)
        self.assertEqual(r['ledger'][0]['exit_time'],7200)
        self.assertAlmostEqual(r['pnl'],10/(101*1.001)*103*.999*.991-10*1.009)

    def test_post_only_requires_trade_through(self):
        b,f=self.frame(low=99.74);r=simulate('rsi_rebound',['TEST-USD'],3600,7200,b,f,'post_only')
        self.assertEqual(r['filled'],0)

    def test_post_only_has_no_same_bar_exit(self):
        b,f=self.frame();r=simulate('rsi_rebound',['TEST-USD'],3600,10800,b,f,'post_only')
        self.assertEqual(r['filled'],1)
        self.assertEqual(r['ledger'][0]['entry_price'],99.75)
        self.assertEqual(r['ledger'][0]['exit_time'],7200)
        self.assertAlmostEqual(r['pnl'],10/99.75*103*.999*.991-10*1.005)

    def test_post_only_rejects_marketable_open(self):
        b,f=self.frame();b['TEST-USD'][3600][1]=99
        r=simulate('rsi_rebound',['TEST-USD'],3600,7200,b,f,'post_only')
        self.assertEqual(r['filled'],0)

    def test_future_does_not_change_past_features(self):
        rows=[[i*3600,100+i,102+i,99+i,101+i,1000] for i in range(240)]
        changed=[r[:] for r in rows]
        for r in changed[220:]:
            for k in range(1,5):r[k]*=2
        a=features(rows,rows);b=features(changed,changed)
        self.assertEqual({t:v for t,v in a.items() if t<220*3600},{t:v for t,v in b.items() if t<220*3600})

    def test_gaps_reset_history(self):
        rows=[[i*3600,100+i,102+i,99+i,101+i,1000] for i in range(400)]
        del rows[200]
        f=features(rows,rows)
        self.assertNotIn(201*3600,f)
        self.assertIn(369*3600,f)

    def test_rotation_keeps_same_coin_without_new_fees(self):
        bars={s:{i*3600:[i*3600,100,101,99,100,1] for i in range(401)} for s in ['BTC-USD','TEST-USD']}
        F={s:{i*3600:{'ret168':.1} for i in range(-1,401)} for s in bars}
        r=simulate('weekly_rotation',['TEST-USD'],0,400*3600,bars,F)
        self.assertEqual(r['trades'],1)
        self.assertEqual(r['ledger'][0]['reason'],'period_end')

if __name__=='__main__':unittest.main()
