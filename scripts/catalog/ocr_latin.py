import json, sys, os
from rapidocr_onnxruntime import RapidOCR
from rapidocr_onnxruntime.ch_ppocr_v3_rec.text_recognize import TextRecognizer
eng = RapidOCR()
eng.text_recognizer = TextRecognizer({'use_cuda': False, 'model_path': os.environ.get('LATIN_REC', 'models/latin/rec.onnx'),
    'keys_path': os.environ.get('LATIN_DICT', 'models/latin/dict.txt'), 'rec_img_shape': [3, 48, 320], 'rec_batch_num': 6})
out = {}
files = sorted(os.listdir(sys.argv[1]))
if len(sys.argv) > 3: files = files[:int(sys.argv[3])]
for f in files:
    res, _ = eng(os.path.join(sys.argv[1], f))
    lines = []
    for box, text, score in (res or []):
        xs = [p[0] for p in box]; ys = [p[1] for p in box]
        lines.append({'text': text, 'left': min(xs), 'top': min(ys), 'width': max(xs)-min(xs), 'height': max(ys)-min(ys), 'score': float(score)})
    out[f] = lines
    print(f, len(lines), file=sys.stderr)
json.dump(out, open(sys.argv[2], 'w'), ensure_ascii=False)
