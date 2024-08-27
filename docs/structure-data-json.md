# Struture data JSON

Meta data list (if available):

- name
- original name
- extension name
- size
- path
- dimension (width, height)
- created date
- orientation
- mime type
- gps
- url

Sample struture JSON in database

## For image

```json
{
  "name":"xjfpa4tuxh66p6s3hrgl0pzn.jpg",
  "extname":"jpg",
  "size":28267,
  "meta":{
    "date":"2010:01:15 18:51:34",
    "host":"Adobe Photoshop CS3 Windows",
    "dimension":{
      "width":346,
      "height":346
    },
    "gps":{
      "latitude":48.862725,
      "longitude":2.287592,
      "altitude":2.287592
    },
    "orientation":{
      "value":1,
      "description":"top-left"
    }
  },
  "mimeType":"image/jpeg",
  "path":"uploads/avatars/xjfpa4tuxh66p6s3hrgl0pzn.jpg",
  "originalName":"aco_bot.jpg",
  "url": "/uploads/avatars/[...]", 
  "variants":[
    {
      "key":"thumbnail",
      "folder":"uploads/avatars/variants/xjfpa4tuxh66p6s3hrgl0pzn.jpg",
      "name":"ajtugq7224qp9moqyi216vur.webp",
      "extname":"webp",
      "size":14860,
      "meta":{
        "date":"2010:01:15 18:51:34",
        "host":"Adobe Photoshop CS3 Windows",
        "dimension":{
          "width":300,
          "height":300
        },
        "orientation":{
          "value":1,
          "description":"top-left"
        }
      },
      "mimeType":"image/webp",
      "path":"uploads/avatars/variants/xjfpa4tuxh66p6s3hrgl0pzn.jpg/ajtugq7224qp9moqyi216vur.webp",
      "url": "/uploads/avatars/variants/[...]", 
    }
  ]
}
```

## For video

```json
{
  "name":"rp1xsz3mz3o70190qnmaptyb.mkv",
  "extname":"mkv",
  "size":1677679979,
  "meta":{
    "dimension":{
      "width":1912,
      "height":812
    }
  },
  "mimeType":"video/x-matroska",
  "path":"videos/rp1xsz3mz3o70190qnmaptyb.mkv",
  "originalName":"The.Legend.of.Kunlun.2022.FRENCH.1080p.WEBRip.x264.AAC-MULTiViSiON.mkv",
  "variants":[
    {
      "key":"preview",
      "folder":"videos/variants/rp1xsz3mz3o70190qnmaptyb.mkv",
      "name":"o8lechg4cuy8psth0b2uebq4.jpg",
      "extname":"jpg",
      "size":31150,
      "meta": {
        "dimension":{
          "width":720,
          "height":306
        },
        "orientation":{
          "value":1,
          "description":"top-left"
        }
      },
      "mimeType":"image/jpeg",
      "path":"videos/variants/rp1xsz3mz3o70190qnmaptyb.mkv/o8lechg4cuy8psth0b2uebq4.jpg"
    }
  ]
}
```
