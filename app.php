<?php
/* Setting up the requirement */
include 'inc/config.php';
require_once __DIR__ . '/vendor/autoload.php';

// Instantiate a new client.
$client = new GetStream\Stream\Client($API_Key, $API_Secret);

// API endpoint location
$client->setLocation($endpointLocation);

// Let The Game Begin
$chris = $client->feed('user', 'chris');
$chris->setGuzzleDefaultOption('verify', 'curl_cacert.pem');
// Add an activity; message is a custom field - tip: add unlimited custom fields!
$data = array(
  "actor" => "chris",
  "verb" => "add",
  "object" => "picture:10",
  "foreign_id" => "picture:10",
  "message" => "Beautiful bird. Absolutely beautiful. Phenomenal bird."
);

$chris->addActivity($data);


// jack's 'timeline' feed follows chris' 'user' feed:
$jack = $client->feed('timeline', 'jack');
$jack->followFeed('user', 'chris');


// Read the 'timeline' feed for jack, chris' post will now show up:
$activities = $jack->getActivities(10);

// Read the next page, use id filtering for optimal performance:
$last_activity = end($activities);
$options = array("id_lte" => $last_activity['id']);
$next_activities = $jack->getActivities(10, $options);

// Remove the activity by referencing the foreign_id you provided:
$chris->removeActivity("picture:10", true);