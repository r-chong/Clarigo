import fasttext
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
MASTER = REPO_ROOT / "ml/data/processed_data/master_broad_v1.jsonl"

model = fasttext.train_supervised(
    input=str(REPO_ROOT / "ml/data/fasttext/train.txt"),
    autotuneValidationFile=str(REPO_ROOT / "ml/data/fasttext/valid.txt"),
    autotuneDuration=600,  # 10 min; start with 120 for a quick pass
    pretrainedVectors=str(REPO_ROOT / "ml/data/fasttext/crawl-300d-2M.vec"),
    dim=300,
    verbose=2,
)
model.save_model(str(REPO_ROOT / "ml/trained_models/clarigo_broad_v1.bin"))
print(model.test(str(REPO_ROOT / "ml/data/fasttext/valid.txt")))