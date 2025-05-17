from .train_model import LFS, EDU, NON_EDU, ABSTAIN

# Test cases - simulated video metadata
test_videos = [
    {
        "id": "test1",
        "title": "Python Programming Tutorial for Beginners",
        "channelTitle": "freeCodeCamp.org",
        "categoryId": "28",  # Science & Technology
        "description": "Learn Python programming"
    },
    {
        "id": "test2",
        "title": "Funny Cat Videos Compilation",
        "channelTitle": "Trap Nation",
        "categoryId": "24",  # Entertainment
        "description": "Best funny moments"
    }
]

def test_labeling_functions():
    print("\nTesting Labeling Functions:")
    print("-" * 50)
    
    for video in test_videos:
        print(f"\nVideo: {video['title']}")
        print("Channel:", video['channelTitle'])
        
        for lf in LFS:
            result = lf(video)
            label = "EDU" if result == EDU else "NON_EDU" if result == NON_EDU else "ABSTAIN"
            print(f"{lf.__name__}: {label}")

if __name__ == "__main__":
    test_labeling_functions()