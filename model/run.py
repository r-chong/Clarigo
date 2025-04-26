#!/usr/bin/env python3
import argparse
import sys

def main():
    parser = argparse.ArgumentParser(
        description="YouTube Labelling Toolkit"
    )
    sub = parser.add_subparsers(dest="cmd", required=True)

    sub.add_parser("build_dataset", help="Fetch video metadata & write CSV")
    sub.add_parser("train_labeller", help="Train Snorkel LabelModel")
    sub.add_parser("train_model",  help="Train downstream scikit-learn model")

    # you can add more commands here later

    args = parser.parse_args()

    if args.cmd == "build_dataset":
        from scripts.create_dataset import main as build_main
        return build_main()
    elif args.cmd == "train_labeller":
        from labeller.train_model import main as train_main
        return train_main()
    elif args.cmd == "train_model":
        from scripts.train_model import main as clf_main
        return clf_main()
    else:
        print(f"Unknown command: {args.cmd}", file=sys.stderr)
        return 1

if __name__ == "__main__":
    sys.exit(main())
