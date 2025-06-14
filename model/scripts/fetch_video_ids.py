import csv
import time
import os
from dotenv import load_dotenv
from googleapiclient.discovery import build

# Load environment variables from .env file
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env'))

# === CONFIGURATION ===
API_KEY = os.getenv('YOUTUBE_API_KEY')  # Get API key from environment variable
if not API_KEY:
    raise ValueError("YOUTUBE_API_KEY environment variable is not set. Please check your .env file.")

# Can be either channel names or channel IDs
EDU_CHANNELS = [
    "Khan Academy",
    "MIT OpenCourseWare",
    "Coursera",
    "Crash Course",
    "TED-Ed",
    "Vsauce",
    "3Blue1Brown",
    "Code.org",
    "Stanford Online",
    "Harvard Online Learning",
    "edX",
    "Numberphile",
    "SciShow",
    "Veritasium",
    "Physics Girl",
    "freeCodeCamp.org",
    "Computerphile",
    "The Coding Train",
    "Kurzgesagt – In a Nutshell",
    "Udacity",
    "Clear Code"
]

NON_EDU_CHANNELS = [
    "Vevo",
    "Trap Nation",
    "Chill Nation",
    "Majestic Casual",
    "MrSuicideSheep",
    "Proximity",
    "TheSoundYouNeed",
    "Liquicity",
    "NoCopyrightSounds",
    "Monstercat",
    "Monstercat Silk",
    "UKF Drum & Bass",
    "UKF Dubstep",
    "Spinnin' Records",
    "Future House Music",
    "This Song is Sick",
    "Ultra Music",
    "EDM.com",
    "House Nation",
    "Techno Club Radio",
    "Deluxe Music",
    "Ambient Worlds",
    "Coffee Music",
    "Buddha Bar",
    "Lofi Girl",
    "Chillhop Music",
    "The Jazz Hop Café",
    "Colors",
    "Tiny Desk Concerts",
    "MTV",
    "Universal Music Group",
    "Sony Music",
    "Warner Music",
    "T-Series",
    "Believe Music",
    "Saavn",
    "Gaana",
    "Eros Now Music",
    "Hungama Music",
    "Zee Music Company",
    "Red Bull Music",
    "Boiler Room",
    "COLORSxSTUDIOS",
    "KEXP",
    "NPR Music",
    "Pitchfork",
    "Brownies & Lemonade",
    "Soulection",
    "The FADER Label",
    "IndieAir",
    "Qobuz",
    "Café De Anatolia",
    "Café Music BGM Channel",
    "ChillOutZone",
    "Electro Posé",
    "MOOD Records",
    "Mosaic",
    "Cratediggers",
    "The 808 Lab",
    "Trap City",
    "Rap Nation",
    "Crush Music",
    "HipHopDX",
    "WorldStarHipHop",
    "UltraSonic Trance",
    "Progressive Sounds",
    "Deep House Delight",
    "Drumcode",
    "Defected Records",
    "Hospital Records",
    "Dim Mak",
    "Mad Decent",
    "OWSLA",
    "Wedding Songs",
    "Golden Oldies",
    "80s Hits",
    "90s Hits",
    "00s Hits",
    "Rock Classics",
    "Pop Hits",
    "Jazz Classics",
    "Classical Music",
    "Opera Classics",
    "Movie Scores",
    "Video Game Music",
    "Cartoon Network Music",
    "LoopedStudyMusic",
    "Rain Sounds",
    "Nature Sounds Relaxation",
    "Meditation Relax Music",
    "Spa Music",
    "Yoga Music",
    "Sleep Sounds",
    "ASMR",
    "Binaural Beats",
    "Brain Food",
    "Focus Music",
    "Study Music",
    "9GAG",
    "Grandayy",
    "Dankland",
    "Memology 101",
    "Memezar",
    "deMemeCentral",
    "Memeulous",
    "Toolie",
    "Dolan Dark",
    "FlyingKitty",
    "SarcasticMommy",
    "AFV",
    "FailArmy",
    "America's Funniest Home Videos",
    "JukinVideo",
    "ViralHog",
    "Zoomin.TV",
    "The Pet Collective",
    "People Are Awesome",
    "Humans Being Bros",
    "CringePit",
    "Quick Laughs",
    "Funny Vines",
    "EpicFails",
    "Best Vines",
    "VineStars",
    "Vines Trending",
    "Top Vines of the 2010s",
    "Classic Vines",
    "MemeChannel",
    "Memes Official",
    "Memes For Life",
    "Dank Memes",
    "Wholesome Memes",
    "Relatable Memes",
    "Fresh Memes",
    "Viral Memes",
    "MemeHub",
    "MemeReview",
    "PewDiePie Reactions",
    "Netflix Is A Joke",
    "Comedy Central Clips",
    "SNL Clips",
    "Jimmy Kimmel Live",
    "Conan O’Brien Highlights",
    "The Ellen Show Clips",
    "Jimmy Fallon Sketches",
    "The Daily Show Clips",
    "The Late Show Clips",
    "Saturday Night Live Shorts",
    "Last Week Tonight Snippets",
    "Key & Peele Sketches",
    "Dave Chappelle Clips",
    "Bill Burr Stand-Up",
    "Conan Sketches",
    "Trevor Noah Clips",
    "John Oliver Clips",
    "Samantha Bee Clips",
    "The Graham Norton Show Clips",
    "The Tonight Show Snippets",
    "The View Highlights",
    "Carpool Karaoke",
    "FailArmy Jr.",
    "AFV Jr.",
    "Clean Memes",
    "Memes for Gamers",
    "Game Memes",
    "Twitch Clips",
    "Streamer Fails",
    "Gaming Fails",
    "Esports Highlights",
    "Overwatch Memes",
    "Fortnite Memes",
    "Minecraft Memes",
    "Roblox Memes",
    "League of Legends Memes",
    "Among Us Memes",
    "Valorant Memes",
    "Apex Legends Memes",
    "Rocket League Memes",
    "Fall Guys Memes",
    "Genshin Impact Memes",
    "TikTok Memes",
    "Instagram Reels Memes",
    "Twitter Memes",
    "Webtoon Memes",
    "Anime Memes",
    "Cartoon Memes",
    "Dog Memes",
    "Cat Memes",
    "Animal Memes",
    "Baby Memes",
    "Music Memes",
    "Movie Memes",
    "TV Show Memes",
    "Celebrity Memes",
    "CollegeHumor",
    "Funny or Die",
    "JustForLaughsTV",
    "Smosh",
    "The Onion",
    "Cracked",
    "Dry Bar Comedy",
    "Comedy Central Stand-Up",
    "Conan O’Brien",
    "Jimmy Fallon",
    "Jimmy Kimmel Live",
    "The Ellen Show",
    "SNL",
    "LastWeekTonight",
    "The Daily Show",
    "Real Time with Bill Maher",
    "The Graham Norton Show",
    "Late Night with Seth Meyers",
    "The Late Show with Stephen Colbert",
    "Guff Comedy",
    "Comedy Dynamics",
    "RedLetterMedia",
    "Screen Junkies",
    "Honest Trailers",
    "Nostalgia Critic",
    "CinemaSins",
    "Trailer Reactions",
    "Gus Johnson",
    "Cody Ko",
    "Noel Miller",
    "Jerry Seinfeld Clips",
    "Kevin Hart Stand-Up",
    "Dave Chappelle Stand-Up",
    "Bill Burr Stand-Up",
    "Brian Regan Clips",
    "Jim Gaffigan Clips",
    "John Mulaney Clips",
    "Ali Wong Clips",
    "Hasan Minhaj Clips",
    "Demetri Martin Clips",
    "Anthony Jeselnik Clips",
    "Hannibal Buress Clips",
    "Tig Notaro Clips",
    "Patton Oswalt Clips",
    "Bo Burnham Clips",
    "Pete Davidson Clips",
    "Ricky Gervais Clips",
    "Eddie Murphy Classics",
    "Robin Williams Classics",
    "Charlie Chaplin Classics",
    "Buster Keaton Classics",
    "The Carol Burnett Show",
    "Monty Python Clips",
    "Key & Peele",
    "Chappelle's Show",
    "MrShow",
    "Upright Citizens Brigade",
    "Second City Network",
    "SketchShe",
    "Awkward Puppets",
    "Just For Laughs Gags",
    "PrankvsPrank",
    "RomanAtwoodVlogs",
    "VitalyzdTV",
    "FouseyTube",
    "NELK",
    "H3H3Productions",
    "h3 Podcast Clips",
    "cr1tikal",
    "Corpse Husband Clips",
    "iDubbbzTV",
    "PewDiePie Funny Moments",
    "Markiplier Funny Moments",
    "Jacksepticeye Funny Clips",
    "videogamedunkey",
    "Game Grumps",
    "TheTryGuys",
    "EpicMealTime",
    "Good Mythical Morning",
    "Rhett & Link",
    "WatchMojo Funny Lists",
    "BuzzFeedVideo Funny",
    "BuzzFeed Multiplayer",
    "BuzzFeedCeleb",
    "Insider Comedy",
    "LADbible Comedy",
    "UNILAD Comedy",
    "Barcroft TV"
]

MAX_VIDEOS_PER_CATEGORY = 500

youtube = build('youtube', 'v3', developerKey=API_KEY)

def resolve_channel_id(identifier):
    if identifier.startswith('UC') and len(identifier) >= 24:
        return identifier  # Already a channel ID
    response = youtube.search().list(
        q=identifier,
        type='channel',
        part='snippet',
        maxResults=1
    ).execute()
    items = response.get('items', [])
    if not items:
        raise ValueError(f"Channel not found for: {identifier}")
    return items[0]['snippet']['channelId']

def get_uploads_playlist_id(channel_id):
    response = youtube.channels().list(
        id=channel_id,
        part='contentDetails'
    ).execute()
    return response['items'][0]['contentDetails']['relatedPlaylists']['uploads']

def get_video_ids_from_playlist(playlist_id, max_videos):
    video_ids = []
    next_page_token = None

    while len(video_ids) < max_videos:
        response = youtube.playlistItems().list(
            playlistId=playlist_id,
            part='contentDetails',
            maxResults=50,
            pageToken=next_page_token
        ).execute()

        for item in response['items']:
            video_ids.append(item['contentDetails']['videoId'])
            if len(video_ids) >= max_videos:
                break

        next_page_token = response.get('nextPageToken')
        if not next_page_token:
            break
        time.sleep(1)

    return video_ids

def collect_video_ids(channel_identifiers, educational_label):
    collected = []
    per_channel = MAX_VIDEOS_PER_CATEGORY // len(channel_identifiers)
    for identifier in channel_identifiers:
        try:
            channel_id = resolve_channel_id(identifier)
            playlist_id = get_uploads_playlist_id(channel_id)
            vids = get_video_ids_from_playlist(playlist_id, per_channel)
            collected.extend([{"video_id": vid, "educational": educational_label} for vid in vids])
            time.sleep(1)
        except Exception as e:
            print(f"Error collecting from channel '{identifier}': {e}")
    return collected

def main():
    # Only collect non-educational videos
    nonedu_videos = collect_video_ids(NON_EDU_CHANNELS, False)

    # Append to existing CSV if it exists
    mode = 'a' if os.path.exists('youtube_video_ids.csv') else 'w'
    with open('youtube_video_ids.csv', mode, newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=['video_id', 'educational'])
        # Write header only if it's a new file
        if mode == 'w':
            writer.writeheader()
        writer.writerows(nonedu_videos)

    print(f"Appended {len(nonedu_videos)} new non-educational videos to youtube_video_ids.csv")

if __name__ == '__main__':
    main()
