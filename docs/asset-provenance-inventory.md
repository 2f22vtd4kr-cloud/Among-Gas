# Retained attached-assets provenance inventory

**Baseline:** `main` at `925a465458e8462cef8b6112daff90a0edc239b3` (2026-11-13).  
**Inventory scope:** every tracked blob below `attached_assets/`; this is not a licence opinion.

## Inventory result

- **66 tracked files**, 53 unique Git blobs, 13 redundant duplicate paths.
- Total tracked bytes: **31,604,923** (30.14 MiB).
- **8 duplicate groups** are byte-identical by Git blob SHA. They should be consolidated only after every script/CI reference and historical evidence dependency is checked.
- A repository-wide literal code search for `attached_assets/` returns 11 source/document/workflow files. The discovered consumers are the collision-data generation/analysis/QA scripts, the fine-grid collision data header, CI and provenance documentation. No browser runtime module was found loading an `attached_assets/` path. The directory is therefore primarily source/QA/reference material, not the public runtime asset directory.
- File names and Git blob identity establish repository contents, **not** creator identity, copyright ownership, permission to redistribute, or commercial rights. All rows remain rights-unverified unless a specific source record is attached.

## Known source/QA inputs

- `1FE850B3-71D3-486E-BF8F-88B9E1132380_1783601827918.png` is the recovered 1652×952 map artwork. The geometry source manifest records SHA-256 `c840fdafe3a1667616a44f6c64bb79fb5ba23c2ad54ba70461416dae153d1a80`. Its creator/ownership and commercial-use permission still require confirmation.
- The three `IMG_2907_*.jpeg` paths share Git blob `4e6018afca7dd8eb27a8b460c3e51c6b58bc33b2` (249,182 bytes). This is the red-line collision reference consumed by fine-grid generation and collision QA. The three paths are identical bytes, not three independent source revisions.
- `IMG_2954_1783630920533.png` shares Git blob `11cd7946e792d1dd1ec737c10d371e3bb69f87c5` with `artifacts/telegram-game/public/map-hires.png` (9,734,170 bytes). It is a duplicate copy of the runtime map PNG, not an independent master.
- `generated_images/character_sprite_sheet.png` is retained under a generated-images folder, but this inventory has not recovered its generation prompt, model/version or source-rights record.

## Duplicate groups

- `c156babb6663d40f4789b958dd3aa4844243ca72` (2 paths): `attached_assets/IMG_2887_1783602362663.webp`, `attached_assets/IMG_2887_1783605337712.webp`
- `4e6018afca7dd8eb27a8b460c3e51c6b58bc33b2` (3 paths): `attached_assets/IMG_2907_1783590932507.jpeg`, `attached_assets/IMG_2907_1783593845208.jpeg`, `attached_assets/IMG_2907_1783632830477.jpeg`
- `8570600d33fdff37e7e81c0d59adf5b4119e58e1` (5 paths): `attached_assets/IMG_2947_1783617740543.webp`, `attached_assets/IMG_2947_1783619677358.webp`, `attached_assets/IMG_2947_1783620092373.webp`, `attached_assets/IMG_2947_1783620848793.webp`, `attached_assets/IMG_2947_1783630457114.webp`
- `62a53ba2d3b994315d7dd1a5e3de63272933eb9f` (2 paths): `attached_assets/IMG_2951_1783620590679.jpeg`, `attached_assets/IMG_2951_1783620829862.jpeg`
- `44f7b10ad3b5e942833e1d38c68ea431f91d3bc9` (3 paths): `attached_assets/IMG_2952_1783621040713.jpeg`, `attached_assets/IMG_2952_1783621070573.jpeg`, `attached_assets/IMG_2952_1783623605477.jpeg`
- `af0349c64398d80cba9fe0bbdec3080466c7ccca` (2 paths): `attached_assets/IMG_2969_1783629657719.jpeg`, `attached_assets/IMG_2969_1783630322300.jpeg`
- `e74a0771ea3e8366302edc1ff90c1d7da053e2e3` (2 paths): `attached_assets/IMG_2984_1783672810937.jpeg`, `attached_assets/IMG_2984_1783682885759.jpeg`
- `f29e14f2b7f021b9bf9c751fd126dc620ffe74a4` (2 paths): `attached_assets/IMG_3010_1783748833295.webp`, `attached_assets/IMG_3010_1783749973232.webp`

## Full file inventory

| Tracked path | Bytes | Git blob SHA | Classification / use |
|---|---:|---|---|
| `attached_assets/1FE850B3-71D3-486E-BF8F-88B9E1132380_1783601827918.png` | 1912558 | `05cb87a17f5d99f6625f703982f598cf87cf9417` | Recovered original map artwork; source hash documented, rights confirmation still needed |
| `attached_assets/BAF1186A-CC7C-4076-B23F-03C55C906007_1783604564967.png` | 2031879 | `831e45f3d7fce2cc6c437e6625a5a4fab6c8111b` | Reference input; exact creator, origin and licence not recorded |
| `attached_assets/generated_images/character_sprite_sheet.png` | 1462639 | `084163c9ce2493b238275f1fabca835d7fa2712f` | Generated-image folder input; generation provenance/prompt not recorded |
| `attached_assets/IMG_2887_1783602362663.webp` | 723268 | `c156babb6663d40f4789b958dd3aa4844243ca72` | Reference input; exact creator, origin and licence not recorded; Duplicate group (2 paths) |
| `attached_assets/IMG_2887_1783605337712.webp` | 723268 | `c156babb6663d40f4789b958dd3aa4844243ca72` | Reference input; exact creator, origin and licence not recorded; Duplicate group (2 paths) |
| `attached_assets/IMG_2888_1783605337712.webp` | 66314 | `9611c670724c1ef9c7729d2de344289106135fc6` | Reference input; exact creator, origin and licence not recorded |
| `attached_assets/IMG_2898_1783586696260.jpeg` | 175317 | `27ff6ccdfa13aa0d471b5df5d1fb7133a61e73a0` | Reference input; exact creator, origin and licence not recorded |
| `attached_assets/IMG_2907_1783590932507.jpeg` | 249182 | `4e6018afca7dd8eb27a8b460c3e51c6b58bc33b2` | Red-line collision reference; CI/source-analysis input, rights confirmation still needed; Duplicate group (3 paths) |
| `attached_assets/IMG_2907_1783593845208.jpeg` | 249182 | `4e6018afca7dd8eb27a8b460c3e51c6b58bc33b2` | Red-line collision reference; CI/source-analysis input, rights confirmation still needed; Duplicate group (3 paths) |
| `attached_assets/IMG_2907_1783632830477.jpeg` | 249182 | `4e6018afca7dd8eb27a8b460c3e51c6b58bc33b2` | Red-line collision reference; CI/source-analysis input, rights confirmation still needed; Duplicate group (3 paths) |
| `attached_assets/IMG_2915_1783596039233.jpeg` | 180550 | `d62ba81088e48bdb0127cdb6b1544db4197be0d1` | Reference input; exact creator, origin and licence not recorded |
| `attached_assets/IMG_2936_1783604300237.jpeg` | 119228 | `b68b596dc7a87046b1f85c137e0c63db60a51bbd` | Reference input; exact creator, origin and licence not recorded |
| `attached_assets/IMG_2937_1783605293999.jpeg` | 145576 | `a2739f771ef7c27f3cf6f2c2c3aaf5d5b5eec5f8` | Reference input; exact creator, origin and licence not recorded |
| `attached_assets/IMG_2940_1783608711056.png` | 3781301 | `919c1a54509849a84f460f395e49bb9aa212c53b` | Reference input; exact creator, origin and licence not recorded |
| `attached_assets/IMG_2941_1783609434358.png` | 2821423 | `4a5589c563c352b931e78fb4a3227b65ed2a84d4` | Reference input; exact creator, origin and licence not recorded |
| `attached_assets/IMG_2942_1783609434358.png` | 2858332 | `2077c8253e5e51842b5719f948812a12e6163446` | Reference input; exact creator, origin and licence not recorded |
| `attached_assets/IMG_2945_1783611262735.jpeg` | 17303 | `682ed861e2b951af22c9ad850341fd19320073dd` | Reference input; exact creator, origin and licence not recorded |
| `attached_assets/IMG_2946_1783617740543.jpeg` | 12545 | `ead66b5bc573ac352434cd94e0b100e2040f958e` | Reference input; exact creator, origin and licence not recorded |
| `attached_assets/IMG_2947_1783617740543.webp` | 11984 | `8570600d33fdff37e7e81c0d59adf5b4119e58e1` | Reference input; exact creator, origin and licence not recorded; Duplicate group (5 paths) |
| `attached_assets/IMG_2947_1783619677358.webp` | 11984 | `8570600d33fdff37e7e81c0d59adf5b4119e58e1` | Reference input; exact creator, origin and licence not recorded; Duplicate group (5 paths) |
| `attached_assets/IMG_2947_1783620092373.webp` | 11984 | `8570600d33fdff37e7e81c0d59adf5b4119e58e1` | Reference input; exact creator, origin and licence not recorded; Duplicate group (5 paths) |
| `attached_assets/IMG_2947_1783620848793.webp` | 11984 | `8570600d33fdff37e7e81c0d59adf5b4119e58e1` | Reference input; exact creator, origin and licence not recorded; Duplicate group (5 paths) |
| `attached_assets/IMG_2947_1783630457114.webp` | 11984 | `8570600d33fdff37e7e81c0d59adf5b4119e58e1` | Reference input; exact creator, origin and licence not recorded; Duplicate group (5 paths) |
| `attached_assets/IMG_2949_1783619591295.jpeg` | 15466 | `e168eb640df499562e9969a253f6fa642a328937` | Reference input; exact creator, origin and licence not recorded |
| `attached_assets/IMG_2950_1783620092373.jpeg` | 15138 | `9f3b4049a4001fcdbf3fb3a8b343be815dab022b` | Reference input; exact creator, origin and licence not recorded |
| `attached_assets/IMG_2951_1783620590679.jpeg` | 13025 | `62a53ba2d3b994315d7dd1a5e3de63272933eb9f` | Reference input; exact creator, origin and licence not recorded; Duplicate group (2 paths) |
| `attached_assets/IMG_2951_1783620829862.jpeg` | 13025 | `62a53ba2d3b994315d7dd1a5e3de63272933eb9f` | Reference input; exact creator, origin and licence not recorded; Duplicate group (2 paths) |
| `attached_assets/IMG_2952_1783621040713.jpeg` | 14545 | `44f7b10ad3b5e942833e1d38c68ea431f91d3bc9` | Reference input; exact creator, origin and licence not recorded; Duplicate group (3 paths) |
| `attached_assets/IMG_2952_1783621070573.jpeg` | 14545 | `44f7b10ad3b5e942833e1d38c68ea431f91d3bc9` | Reference input; exact creator, origin and licence not recorded; Duplicate group (3 paths) |
| `attached_assets/IMG_2952_1783623605477.jpeg` | 14545 | `44f7b10ad3b5e942833e1d38c68ea431f91d3bc9` | Reference input; exact creator, origin and licence not recorded; Duplicate group (3 paths) |
| `attached_assets/IMG_2954_1783630920533.png` | 9734170 | `11cd7946e792d1dd1ec737c10d371e3bb69f87c5` | Byte-identical copy of public/map-hires.png; source/rights record still needed |
| `attached_assets/IMG_2958_1783624186711.jpeg` | 19467 | `ff99eb6bd6fb536951134f545b8259c74a591713` | Reference input; exact creator, origin and licence not recorded |
| `attached_assets/IMG_2959_1783625500018.jpeg` | 12114 | `646b2390df63da4f817bf2664a7cb99f2a85abc6` | Reference input; exact creator, origin and licence not recorded |
| `attached_assets/IMG_2961_1783625789937.jpeg` | 11530 | `69cd20452112a1b4dfbf133e2c2f228c1f5da89e` | Reference input; exact creator, origin and licence not recorded |
| `attached_assets/IMG_2963_1783627194029.jpeg` | 6219 | `a86c6ac3173af04ca9bdf03cb41695e764c1caac` | Reference input; exact creator, origin and licence not recorded |
| `attached_assets/IMG_2964_1783628295670.jpeg` | 5780 | `38e1887ea39756d7902545c0118d3788c8fd9b23` | Reference input; exact creator, origin and licence not recorded |
| `attached_assets/IMG_2965_1783628526684.jpeg` | 5003 | `a241a9e1936da6bfab97ce2aba02d5b40d8b7f29` | Reference input; exact creator, origin and licence not recorded |
| `attached_assets/IMG_2966_1783628526684.jpeg` | 7711 | `fbebb643273654a3002ebb04fa04392dadbfa783` | Reference input; exact creator, origin and licence not recorded |
| `attached_assets/IMG_2967_1783628526684.jpeg` | 5789 | `69ec8c2b9cb19591ef2a1382f9b609a5dacf06ff` | Reference input; exact creator, origin and licence not recorded |
| `attached_assets/IMG_2968_1783629316648.jpeg` | 7574 | `30794c43b53fc30636bf6eecc71259f28fe52fd7` | Reference input; exact creator, origin and licence not recorded |
| `attached_assets/IMG_2969_1783629657719.jpeg` | 6384 | `af0349c64398d80cba9fe0bbdec3080466c7ccca` | Reference input; exact creator, origin and licence not recorded; Duplicate group (2 paths) |
| `attached_assets/IMG_2969_1783630322300.jpeg` | 6384 | `af0349c64398d80cba9fe0bbdec3080466c7ccca` | Reference input; exact creator, origin and licence not recorded; Duplicate group (2 paths) |
| `attached_assets/IMG_2971_1783631156418.jpeg` | 374744 | `597164778b2095fe99813b0277b44884bd515bdb` | Reference input; exact creator, origin and licence not recorded |
| `attached_assets/IMG_2972_1783631392364.jpeg` | 323202 | `2beb8f0189712da98927e3a3d4b652300b762211` | Reference input; exact creator, origin and licence not recorded |
| `attached_assets/IMG_2973_1783631680200.jpeg` | 171565 | `6aefca800b871ce5999dfb1b3dd3240e6b9347f5` | Reference input; exact creator, origin and licence not recorded |
| `attached_assets/IMG_2974_1783656137059.jpeg` | 156561 | `a82a48b53ff1a16fc75532bf06ad359f72aed54d` | Reference input; exact creator, origin and licence not recorded |
| `attached_assets/IMG_2979_1783658554613.jpeg` | 306470 | `65f326423b1805990c59e98aeb950a4afddf0be5` | Reference input; exact creator, origin and licence not recorded |
| `attached_assets/IMG_2983_1783671562586.jpeg` | 124790 | `10bdc77c00d3849b0108aa8531001026000de02b` | Reference input; exact creator, origin and licence not recorded |
| `attached_assets/IMG_2984_1783672810937.jpeg` | 13359 | `e74a0771ea3e8366302edc1ff90c1d7da053e2e3` | Reference input; exact creator, origin and licence not recorded; Duplicate group (2 paths) |
| `attached_assets/IMG_2984_1783682885759.jpeg` | 13359 | `e74a0771ea3e8366302edc1ff90c1d7da053e2e3` | Reference input; exact creator, origin and licence not recorded; Duplicate group (2 paths) |
| `attached_assets/IMG_2989_1783676922907.png` | 729408 | `b22652e7903db2dfdb8b3f884761ff08b25350e5` | Reference input; exact creator, origin and licence not recorded |
| `attached_assets/IMG_2993_1783681349063.png` | 459622 | `d288821014ae472e39fa49077a11dbc852257f00` | Reference input; exact creator, origin and licence not recorded |
| `attached_assets/IMG_3001_1783704862506.png` | 485622 | `4904f2acdc3ca853538f0b0c77eef269a0e9b630` | Reference input; exact creator, origin and licence not recorded |
| `attached_assets/IMG_3006_1783716314524.jpeg` | 77822 | `9b1a8d3267194df258d5abf909c4cefdc0a89d7c` | Reference input; exact creator, origin and licence not recorded |
| `attached_assets/IMG_3009_1783748833295.jpeg` | 364156 | `6e53cfb032d0afc25280feed89bd81e80ce77b76` | Reference input; exact creator, origin and licence not recorded |
| `attached_assets/IMG_3010_1783748833295.webp` | 53396 | `f29e14f2b7f021b9bf9c751fd126dc620ffe74a4` | Reference input; exact creator, origin and licence not recorded; Duplicate group (2 paths) |
| `attached_assets/IMG_3010_1783749973232.webp` | 53396 | `f29e14f2b7f021b9bf9c751fd126dc620ffe74a4` | Reference input; exact creator, origin and licence not recorded; Duplicate group (2 paths) |
| `attached_assets/IMG_3011_1783749973232.jpeg` | 77060 | `a8d062a5fc6f701a8d8f7511ed533ad5f5eb3308` | Reference input; exact creator, origin and licence not recorded |
| `attached_assets/Pasted-Great-progress-the-server-ts-you-shared-is-a-strong-sel_1783665582933.txt` | 4618 | `4a2b08b69477a7c38de679ce872d32157c1c365d` | Archived text/context; not a runtime asset |
| `attached_assets/Pasted-Here-is-the-complete-self-contained-and-ready-to-run-se_1783665407349.txt` | 15187 | `9420cd7e26d2bd88a3a6ddf26e08db9d81fd8a26` | Archived text/context; not a runtime asset |
| `attached_assets/Pasted-Processed-Improved-I-reviewed-the-three-modules-you-sha_1783665384475.txt` | 4033 | `cd06aa6ff723484e13541919641aa8c016c206b8` | Archived text/context; not a runtime asset |
| `attached_assets/Pasted-Repo-Analysis-Complete-I-examined-https-github-com-2f22_1783683371738.txt` | 2721 | `15f48d968dae4f6d127e8f35c29907ab85754711` | Archived text/context; not a runtime asset |
| `attached_assets/Pasted-Save-this-file-in-your-Replit-workspace-as-AMONG-US-TEL_1783665354423.txt` | 8486 | `ada1d1f4a0fd28222c0bf9f5f36da5538e1cc1f4` | Archived text/context; not a runtime asset |
| `attached_assets/Pasted-This-consolidated-specification-is-excellent-You-captur_1783665338453.txt` | 5724 | `25229e59b846f003961093b224db0f53ba0f12a9` | Archived text/context; not a runtime asset |
| `attached_assets/Pasted-To-make-sure-your-Replit-workspace-has-the-complete-seq_1783665346953.txt` | 7320 | `0fd6625270ddfc7d3bd712e8eea301de0845dd47` | Archived text/context; not a runtime asset |
| `attached_assets/Pasted-Your-consolidation-is-flawless-You-have-successfully-de_1783665396738.txt` | 4921 | `db7d67d4fdf5dc041f979b3ebe6b5e9df0dc66ae` | Archived text/context; not a runtime asset |

## Required closure work

1. For each non-text image, record creator/source, date obtained, original URL or owner statement, licence/permission, attribution obligations, and whether commercial distribution is permitted.
2. Distinguish original map artwork and user-supplied red-line references from third-party game screenshots, design references, generated candidates and incidental evidence captures. Do not infer any category from the filename alone.
3. Keep source/QA inputs out of the public runtime bundle unless explicitly required. Preserve the two documented map source inputs while generation and CI depend on them.
4. Consolidate byte-identical duplicates only after checking all tracked scripts, CI jobs and historical-review links. Never delete the only copy of a canonical source or a required QA fixture merely to reduce the file count.
5. Keep assets with unknown rights out of commercial release until documented permission or an original replacement exists.

**Decision:** inventory is complete by tracked path, size and blob SHA. Rights/creator provenance is not complete; this file deliberately does not mark unknown assets as cleared.
