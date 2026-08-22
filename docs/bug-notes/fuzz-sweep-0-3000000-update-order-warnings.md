# `updateOrder` Warning Inventory: Fuzz Sweep 0-3M

This is an inventory of every `updateOrder could not honor the requested position`
warning recorded in `fuzz-sweep-0-3000000-RERUN.md`.

- Warning blocks: 133
- Affected entries: 169
- Candidate intervals: 115

The ranges below are inferred from the progress checkpoints in the sweep log.
Each warning was emitted after the preceding checkpoint and before the next one.
Run an interval with:

```powershell
npx -y tsx scripts/fuzz-run.ts --seed <from> --to <to> --mutations 3
```

The first warning was reproduced as seed `35388` and is covered by the recent
implicit dotted-key ordering fix. Seed `135327` was the next warning found while
working through this list and is covered by the inline-table insertion-order fix.
Seed `1112646` was found while continuing the sweep and is covered by the nested
inline-array replacement fix.
If a rerun produces no seed-prefixed warning, consider that warning shape fixed
by the same change.

## Seeds 0-999999

- 30000..39999: exrxe.cicdh810.k54 (resolved as seed 35388)
- 90000..99999: .tk.k13
- 100000..109999: sew.t-s0km-d.k48
- 100000..109999: sew.t-s0km-d.k58
- 110000..119999: zu-a77lhfm.ddna..ywfsssuff.k14
- 120000..129999: guo8x_y.n_o.jiroou5-.k12
- 120000..129999: guo8x_y.n_o.jiroou5-.k4
- 130000..139999: 9x:..0.vl..hk1grzv.tf.k84 (resolved as seed 135327)
- 180000..189999: zi.vd18.ik7.0.vhbaz0fk42.hyqku3jmk-.p7u7_5_9.flzl.cVLV3j~.k22
- 190000..199999: gotoqq.>[r|{{.RtFtwoS.uxf.k59
- 190000..199999: gotoqq.>[r|{{.RtFtwoS.uxf.k0
- 210000..219999: 9Rb.dvz-be.s3tjh.k95
- 210000..219999: 9Rb.dvz-be.s3tjh.k10
- 290000..299999: avmdx9v_x.i-niabh..G),9GX.up8_egl.e7x9_dci4a.k67
- 310000..319999: necyy_.cc..|bOI[7lHP[.tkrcghcp.k1
- 320000..329999: i]xKmZ^nK.S42n.x.k92
- 340000..349999: lj0_0sl7-b.s63izsj.vef2vqr.z3.k9
- 340000..349999: lj0_0sl7-b.s63izsj.vef2vqr.z3.k18
- 350000..359999: Y`.v3wow.coe0qk8u.k8
- 360000..369999: sy.ald2w_sen.@(+TY].5.k6
- 380000..389999: b.p54wjyg_.uwumri.aq.iq8.5>:.k12
- 390000..399999: .G.v_1xip-i.k64
- 390000..399999: .G.v_1xip-i.k31
- 400000..409999: <YM&.n-sy9x.od.k37
- 450000..459999: frn.g.k97
- 450000..459999: nbyovg.zoj_1b5y5.k99
- 470000..479999: lo9q9.k82
- 480000..489999: q2xq.jpz46s8p3b.og-2syq.k25
- 500000..509999: qbtma.i.v4.k44
- 530000..539999: tic.ex.U9I.6vo-T .].d.k98
- 570000..579999: a0.k62
- 580000..589999: jzexz.zn.k59
- 600000..609999: esyl.k83
- 600000..609999: esyl.k2
- 630000..639999: l5j2j-_-u.(.xxssxtssxs.b6boel9vt.k49
- 640000..649999: yvae4z1zg.q.0.T3VPseU(h.py.co1sp.k44
- 640000..649999: yvae4z1zg.q.0.T3VPseU(h.py.co1sp.k94
- 670000..679999: p8h1u.hn Y%WX}.k6.k8
- 690000..699999: m.rttvk5m0.H0WB/85v.u.k44
- 700000..709999: bhyxaf7ev.r7rj77.k22
- 780000..789999: mv5.k54
- 780000..789999: nj.k87
- 780000..789999: nj.k16
- 820000..829999: f4jr0--u.lww.lohbliih.k97
- 820000..829999: e6glz.k82
- 840000..849999: .k72
- 880000..889999: gu6ds9oi6.D6rDD<_.k11
- 880000..889999: gu6ds9oi6.D6rDD<_.k88
- 910000..919999: dz4ut.yzrmeh_.k61
- 910000..919999: dz4ut.yzrmeh_.k25
- 930000..939999: bu5d.ksec.k.O.k67
- 930000..939999: bu5d.ksec.k.O.k26
- 950000..959999: ^.k47
- 950000..959999: ^.k96
- 980000..989999: te.1YY-t1UoU.huu1-ch.GxRg+/.k55
- 990000..999999: ta.HX_Z59_y3(.k68

## Seeds 1000000-1999999

- 1030000..1039999: bhinw4-1g.y-idh-2ek.k37
- 1030000..1039999: bhinw4-1g.y-idh-2ek.k6
- 1050000..1059999: i0g.k96
- 1060000..1069999: f86xoxxb.jqxw08.~N.rH.%.k70
- 1060000..1069999: f86xoxxb.jqxw08.~N.rH.%.k11
- 1110000..1119999: f7k3.pij21ppfrn.{Jvh#.b8f.oyo_dv5f.k0 (resolved as seed 1112646)
- 1120000..1129999: pdju9i3fc2.s0c6-p_.j-.k69
- 1150000..1159999: t.tg.k86
- 1150000..1159999: t.tg.k74
- 1190000..1199999: om6xqe_.kh3n.k32
- 1220000..1229999: ua3d7i.ni.k79
- 1250000..1259999: n/..E$haIwKABd.gdnx0o.4}.l.k21
- 1250000..1259999: n/..E$haIwKABd.gdnx0o.4}.l.k5
- 1250000..1259999: do_8ns-7.k2
- 1250000..1259999: y86x.h.ldreq67x.zxdu7qv.f657ix0.k0
- 1270000..1279999: sz4-auihwl.lsh.gzpdev6v2k.k40
- 1270000..1279999: sz4-auihwl.lsh.gzpdev6v2k.k61
- 1280000..1289999: .:!v4.e.o.k44
- 1330000..1339999: GD.V@ao7D$A.p2h.k86
- 1360000..1369999: a7e67a.k35
- 1370000..1379999: b0-.UqXC~}ye.ld-a19.mq.rrm5yc.k0
- 1390000..1399999: vuynzi1sg.scglu.k99
- 1390000..1399999: [Njl%i.hps.k13
- 1410000..1419999: s7g5.mj6v9.q.k68
- 1410000..1419999: s7g5.mj6v9.q.k55
- 1430000..1439999: xRQzto.k53
- 1440000..1449999: .fi3j.k34
- 1470000..1479999: n|$.dE8[Sl.k40
- 1470000..1479999: (7~jf7.ftes..tY:Zb..k43
- 1470000..1479999: (7~jf7.ftes..tY:Zb..k63
- 1500000..1509999: g.k15
- 1530000..1539999: 1maZ5uI^ m.W5Y_,Q y-.k0
- 1560000..1569999: fn8u7g.h Gg%bCe.f9.:ThTY.hv.k6
- 1590000..1599999: bao_.b}tyx.aF.zG`1o.k13
- 1670000..1679999: _BiH*.mi1.k58
- 1670000..1679999: f{S^x.0.;|Y!e.4h.gd4.k75
- 1670000..1679999: f{S^x.0.;|Y!e.4h.gd4.k66
- 1680000..1689999: .k67
- 1680000..1689999: QmZ.hVag.k3
- 1690000..1699999: f.l-a334.c..k79
- 1700000..1709999: yg_2ha4q.k49
- 1700000..1709999: yg_2ha4q.k2
- 1720000..1729999: nftvuyy.:~gg$B/.k51
- 1730000..1739999: okt.szzo9-.k6
- 1770000..1779999: wrx6q5map6.h.C|=ByS.b24k98p50.k60
- 1770000..1779999: r4tsiwckq.k59
- 1790000..1799999: erwq9e104f.q84we0fm.d1.k69
- 1790000..1799999: )n.k8
- 1810000..1819999: y5)p5e.7sAs.k22
- 1810000..1819999: y5)p5e.7sAs.k31
- 1820000..1829999: m.rxzua.k20
- 1830000..1839999: pzgrzn.).k98
- 1830000..1839999: pzgrzn.).k83
- 1830000..1839999: s5xqm..k89
- 1830000..1839999: hp6g0quz_i.rkhZ.fi1.ZCLa6KZ.k96
- 1860000..1869999: f)ooK|`TM7.c_-6.a8iyb.kawz7l5e6x.bdwqtff-ov.k53
- 1870000..1879999: ej7m5pz1.nasdvst1.osn.yogqgsi.k4
- 1880000..1889999: aro.7.tt12f4n2.k39
- 1880000..1889999: aro.7.tt12f4n2.k56
- 1890000..1899999: ac.VUNIo9Q.k86
- 1890000..1899999: 3;G@c0O>t[.d6mes.zqheq8d2.k6
- 1900000..1909999: QyLBR.!SsTq=.k68
- 1970000..1979999: ap%&$OZn.v.yu2vuahq.k65
- 1980000..1989999: k2.y0_.k70
- 1990000..1999999: dfk6lq4qe-.k4

## Seeds 2000000-2999999

- 2000000..2009999: SEssjq.b-9gfqcr7e.x.k86
- 2000000..2009999: SEssjq.b-9gfqcr7e.x.k92
- 2010000..2019999: xngh5o.h8-t.k2
- 2010000..2019999: xngh5o.h8-t.k51
- 2100000..2109999: wa.W;;@Ad7z/.VDu.k35
- 2100000..2109999: wa.W;;@Ad7z/.VDu.k49
- 2150000..2159999: }34mO*tG.z5-x.k11
- 2170000..2179999: ^;9[t^=)S.bl7.Jv&(EX<n.k23
- 2220000..2229999: hllidogz.g76eta2ab.kzn8a26889.n2x33.k63
- 2230000..2239999: RSOL![..k20
- 2250000..2259999: k.id2ab-chgv.iruosej.j963.k91
- 2270000..2279999: ],#bTcC.).p4L-~u$.hkw3.k1
- 2270000..2279999: ],#bTcC.).p4L-~u$.hkw3.k18
- 2350000..2359999: qf8.7& )mr%d*.k48
- 2350000..2359999: qf8.7& )mr%d*.k93
- 2370000..2379999: Zr.;{s1(?V/.k14
- 2390000..2399999: .bpwyxyb.vjq.smy18o1j5.k82
- 2390000..2399999: .bpwyxyb.vjq.smy18o1j5.k52
- 2400000..2409999: j6.uq227r)bU.zudi202.kw97.k12
- 2410000..2419999: vs6.l_xv.k60
- 2430000..2439999: in.rlq5f836v2.jb6a.k60
- 2440000..2449999: p.k35
- 2440000..2449999: 0UP:,q.fdwdwpk0p.u.z_qufbe.n0ht.3(..Q|9I.k48
- 2470000..2479999: j-h5ewz.s89q8vbmw.k13
- 2510000..2519999: yf-xgr3dhh.k556c5_q.B.lt-48.k75
- 2550000..2559999: z1eu.k48
- 2570000..2579999: l.xqd.C-r*/(Yul .x.0.epc5yzy73.i797cxso8w.k28
- 2570000..2579999: l.xqd.C-r*/(Yul .x.0.epc5yzy73.i797cxso8w.k43
- 2620000..2629999: 2ND`.-u.j6_sk8qth.oh95wpo9.uc.k59
- 2620000..2629999: gdr6kl_h_.w.k23
- 2630000..2639999: ies.yn7bz.bgm.l5wb2s.k0
- 2630000..2639999: ies.yn7bz.bgm.l5wb2s.k21
- 2650000..2659999: i*@y.zw7g.lpujyfyk..mb7c0wyiz.k37
- 2650000..2659999: i*@y.zw7g.lpujyfyk..mb7c0wyiz.k79
- 2680000..2689999: vm21yx.gjd.jha17bp.qUb~A$@.k20
- 2680000..2689999: lrb73648.tejz4ilr.4X Ge)*.om7ah7nqj8.vfa982r.k73
- 2730000..2739999: nl.k83
- 2780000..2789999: wqyar.git3.k60
- 2790000..2799999: i..nkf3.k51
- 2810000..2819999: xbe.7hm.w_We.ddbo_9xka.y(R.k85
- 2920000..2929999: xgo6.bws-7g8txh.k29
- 2920000..2929999: xgo6.bws-7g8txh.k52
- 2920000..2929999: Je,AG$v.j.k_nwiz.k14
- 2930000..2939999: m4eg.0.k51
- 2930000..2939999: m4eg.0.k69
- 2940000..2949999: }[qqv.k97
- 2950000..2959999: Ld=m1L$VG:.earjwptxc..uyi.k97
- 2960000..2969999: tx2wxqm.fy2ap.lv.w.k88