# scikit learn imports
from sklearn.pipeline import FeatureUnion, Pipeline
from sklearn.preprocessing import OneHotEncoder, FunctionTransformer
from sklearn.feature_extraction.text import HashingVectorizer, TfidfVectorizer
from sklearn.linear_model import LogisticRegression

# … assume X_train has columns ["title","description","categoryId","channelId","tags"] …

# Text = title + description
text_pipe = Pipeline([
    ("sel", FunctionTransformer(lambda d: (d["title"] + " " + d["description"]).values, validate=False)),
    ("tfidf", TfidfVectorizer(max_features=10000)),
])

# Tags = comma-sep text
tags_pipe = Pipeline([
    ("sel", FunctionTransformer(lambda d: d["tags"].fillna("").str.replace(",", " ").values, validate=False)),
    ("tfidf", TfidfVectorizer(max_features=5000)),
])

# CategoryId = one-hot (low cardinality)
cat_pipe = Pipeline([
    ("sel", FunctionTransformer(lambda d: d[["categoryId"]], validate=False)),
    ("oh", OneHotEncoder(handle_unknown="ignore")),
])

# ChannelId = hashing (high cardinality)
chan_pipe = Pipeline([
    ("sel", FunctionTransformer(lambda d: d["channelId"].fillna(""), validate=False)),
    ("hash", HashingVectorizer(n_features=2000)),
])

# Combine & classify
model = Pipeline([
    ("feats", FeatureUnion([
        ("text", text_pipe),
        ("tags", tags_pipe),
        ("cat", cat_pipe),
        ("chan", chan_pipe),
    ])),
    ("clf", LogisticRegression(max_iter=1000)),
])

model.fit(X_train, y_train)
