import { TypingText } from '../objects/typingtext'
import { Enum } from '../utils/enum'
import merge_data from '../utils/merge'
import { clamp } from '../utils/clamp'
import { mad, median } from '../utils/medians'
import generateTrials from '../utils/trialgen'
import point_in_circle from '../utils/pointincircle'

const WHITE = 0xffffff
const GRAY = 0x666666
const BALL_SIZE_RADIUS = 7
var BALL_X = 25
var PADDLE_X = 20
const MOVE_SCALE = 0.75 // factor to combat pointer acceleration
const PI = Math.PI

// fill txts later
let instruct_txts = {}

const states = Enum([
    'INSTRUCT', // show text instructions (based on stage of task)
    'PRETRIAL', // wait until press button to start
    'MOVING', // adjusting paddle position
    'WAITING', //watching ball bounce
    'POSTTRIAL', // display points, pause before reset trial
    'END' //
])

function countTrials(array) {
    return array.filter((v) => !v['trial_type'].startsWith('instruct_') && !v['trial_type'].startsWith('break')).length
}

function rmoutliers(array) { // akin to matlab rmoutliers function; 3*MAD removed
    var arr_mad = mad(array)
    var arr_med = median(array)
    return array.filter((v) => Math.abs(v - arr_med) <= 3 * arr_mad)
}

function findRMSE(array) {
    clean_arr = rmoutliers(array)
    if (clean_arr.length == 0) {
        clean_arr = array
        console.log("findRMSE failed due to no non-zero entries")
    }
    var sq_err = clean_arr.reduce((total, curr) => {
        if (Number.isFinite(curr))
            return total + curr * curr;
    }, 0);
    return Math.sqrt(sq_err / clean_arr.filter(v => Number.isFinite(v)).length)
}

function InvErf(x) {
    const a = 0.147
    //if (0 == x) { return 0 }
    const b = 2 / (Math.PI * a) + Math.log(1 - x ** 2) / 2
    const sqrt1 = Math.sqrt(b ** 2 - Math.log(1 - x ** 2) / a)
    const sqrt2 = Math.sqrt(sqrt1 - b)
    return sqrt2 * Math.sign(x)
}

function fixErrorRate(rmse, ER) {
    var paddle_rad = Math.sqrt(2) * rmse * InvErf(1 - ER) //rmse tells us what distribution to use-- this solves the integral
    console.log("Computed Radius: " + paddle_rad)
    return paddle_rad
}

export default class MainScene extends Phaser.Scene {
    constructor() {
        super({ key: 'MainScene' })
        this._state = states.INSTRUCT
        this.entering = true
        // these line up with trial_type
        this.all_data = {
            calib: [], // practice reaching with vis feedback
            basic: []
        }
    }
    preload() {
        this.load.plugin('rexroundrectangleplugin', 'https://raw.githubusercontent.com/rexrainbow/phaser3-rex-notes/master/dist/rexroundrectangleplugin.min.js', true)
    }
    create() {
        let config = this.game.config
        let user_config = this.game.user_config
        // let hand = user_config.hand // 'right' or 'left'

        // camera (origin is center, [0,0] is middle of screen)
        this.cameras.main.setBounds(-config.width / 2, -config.height / 2, config.width, config.height)
        let height = config.height
        var hd2 = height / 2
        this.trial_counter = 0
        this.entering = true
        this.state = states.INSTRUCT
        this.is_debug = user_config.debug

        // set number of repeats
        if (this.is_debug) {
            this.trials = generateTrials(40, height, true)
            this.typing_speed = 1
        } else {
            this.trials = generateTrials(80, height) //120 trials sounds good?
            this.typing_speed = 1
        }

        //now set up the ball
        BALL_X = config.width / 2 - 25
        this.ball = this.add.circle(BALL_X, 0, BALL_SIZE_RADIUS, WHITE)
        //this.game.physics.enable(this.ball, Phaser.Physics.ARCADE)
        this.ball_vx = 0;
        this.ball_vy = 0;
        this.ball_theta = 0;
        this.ball.visible = false

        // paddle
        PADDLE_X = -config.width / 2 + 10 //tbh not sure how I want to do this yet, check how it looks
        this.user_paddle = this.add.rectangle(PADDLE_X, 0, 15, 200, WHITE).setOrigin(0.5, 0.5)
        this.paddle_radius = 100; // starting at 100
        //this.game.physics.enable(this.user_paddle, Phaser.Physics.ARCADE)
        //this.user_paddle.body.immovable = true //when ball collides with paddle, paddle should not move

        //line indicating direction
        this.ball_direction = this.add.line(BALL_X, 0, 0, 0, 0, 50, 0xffffff).setOrigin(0.5, 0.5).setVisible(false)
        this.ball_direction.setLineWidth(3, 3)

        //MAKE LOTTERY!!!
        this.good_box = this.add.rectangle(PADDLE_X + 225, 0, 150, 150).setOrigin(1, 0.5).setVisible(false)
        this.good_box.setStrokeStyle(4, 0xffffff);
        this.bad_box = this.add.rectangle(PADDLE_X + 225, 0, 150, 150).setOrigin(0, 0.5).setVisible(false)
        this.bad_box.setStrokeStyle(4, 0xffffff);

        this.good_txt = this.add.text(PADDLE_X + 150, 0, '+10', {
            fontFamily: 'Verdana',
            color: '#00ff00',
            backgroundColor: '#000000',
            fontSize: 50,
            align: 'center'
        }).setOrigin(0.5, 0.5).setVisible(false)
        this.bad_txt = this.add.text(PADDLE_X + 300, 0, '0', {
            fontFamily: 'Verdana',
            color: '#ff0000',
            backgroundColor: '#000000',
            fontSize: 50,
            align: 'center'
        }).setOrigin(0.5, 0.5).setVisible(false)

        // midline
        //var lineInc = 2 * hd2 / 12
        //for (var i = 0; i < 13; i++) {
        //    var tempseg = this.add.line(0, -hd2 + i * lineInc, 0, 0, 0, 2 / 3 * lineInc, 0xffffff)
        //    tempseg.setLineWidth(3, 3)
        //}
        //var midline = this.add.line(0, -hd2, 0, 0, 0, 4*hd2, 0xffffff)
        //midline.setLineWidth(3,3)

        //bounding box
        this.box = this.add.rectangle(0, 0, height, 0.8 * height).setOrigin(0.5, 0.5).setVisible(false)
        this.box.setStrokeStyle(4, 0xffffff);


        // big fullscreen quad in front of game, but behind text instructions
        this.darkener = this.add.rectangle(0, 0, height+5, height, 0x000000).setAlpha(1)

        //the ratings scale!
        //also txt showing the value!
        this.happiness_txt1 = this.add.text(-310, 250, 'Very unhappy', {
            fontFamily: 'Verdana',
            color: '#ffffff',
            backgroundColor: '#000000',
            fontSize: 24,
            align: 'center'
        }).
            setOrigin(1, 0.5).setVisible(false)
        this.happiness_txt2 = this.add.text(310, 250, 'Very happy', {
            fontFamily: 'Verdana',
            color: '#ffffff',
            backgroundColor: '#000000',
            fontSize: 24,
            align: 'center'
        }).
            setOrigin(0, 0.5).setVisible(false)
        this.happiness_instruct = this.add.text(0, 125, 'How happy are you right now?', {
            fontFamily: 'Verdana',
            color: '#ffffff',
            backgroundColor: '#000000',
            fontSize: 40,
            align: 'center'
        }).
            setOrigin(0.5, 0.5).setVisible(false)

        this.happiness_scale = this.add.rexRoundRectangle(0, 250, 600, 15, 15, 0xffffff).setVisible(false)
        this.happiness_thumb = this.add.circle(0, 250, 20, 0x3b719f).setOrigin(0.5, 0.5).setVisible(false)
        this.happiness_value = 0
        //this.sense = 6 //sensitivity of slider to arrow key press

        //slider using arrow keys (with smooth acceleration)
        //this.input.keyboard.on('keydown-LEFT', (evt) => {
        //    if (this.happiness_thumb.visible) {
        //        if (evt.repeat)
        //            this.sense = Math.min(this.sense + 3, 24)
        //        else
        //            this.sense = 6
        //        this.happiness_thumb.x = Math.max(this.happiness_thumb.x - this.sense, -300)
        //        this.happiness_value = Math.round(((this.happiness_thumb.x + 300) / 600) * 100)
        //    }
        //})
        //this.input.keyboard.on('keydown-RIGHT', (evt) => {
        //    if (this.happiness_thumb.visible) {
        //        if (evt.repeat)
        //            this.sense = Math.min(this.sense + 3, 24)
        //        else
        //            this.sense = 6
        //        this.happiness_thumb.x = Math.min(this.happiness_thumb.x + this.sense, 300)
        //        this.happiness_value = Math.round(((this.happiness_thumb.x + 300) / 600) * 100)
        //    }
        //})


        // text components
        this.other_warns = this.add.
            rexBBCodeText(0, 0, '', {
                fontFamily: 'Verdana',
                fontStyle: 'bold',
                fontSize: 50,
                color: '#ffffff',
                align: 'center',
                stroke: '#444444',
                backgroundColor: '#000000',
                strokeThickness: 4
            }).
            setOrigin(0.5, 0.5).
            setVisible(false)

        this.instructions = TypingText(this, /* half width */-400, -hd2 + 50, '', {
            fontFamily: 'Verdana',
            fontSize: 30,
            wrap: {
                mode: 'word',
                width: 800
            }
        }).setVisible(false)

        this.start_txt = this.add.
            text(0, hd2 - 100, 'Press SPACE to continue.', {
                fontFamily: 'Verdana',
                fontSize: 50,
                align: 'center'
            }).
            setOrigin(0.5, 0.5).
            setVisible(false)

        this.launch_txt = this.add.text(0, hd2 - 50, 'Press SPACE to launch the puck', {
            fontFamily: 'Verdana',
            fontSize: 50,
            backgroundColor: "#000000",
            align: 'center'
        }).
            setOrigin(0.5, 0.5).
            setVisible(false)

        this.debug_txt = this.add.text(-hd2, -hd2, '')
        this.progress = this.add.text(hd2, -hd2, '').setOrigin(1, 0)
        this.tmp_counter = 1
        this.total_len = countTrials(this.trials)



        //score and points
        this.pt_total = 0;
        this.points_total = this.add.text(0, -hd2 + 50, 'Total Points: ' + this.pt_total, {
            fontFamily: 'Verdana',
            color: "#ffffff",
            backgroundColor: "#000000",
            fontSize: 35,
            align: 'center'
        }).setOrigin(0.5, 0.5)

        this.pt_txt = this.add.text(0, 0, '', { fontFamily: 'Verdana', color: "#00ff00" }).setOrigin(0.5, 0.5)

        //lottery!
        //boxes
        this.left

        //set up accuracy related objects
        this.window = 20
        this.acc_history = Array.apply(null, Array(this.window)).map(function () { return NaN })
        this.hit_history = Array.apply(null, Array(this.window)).map(function () { return NaN })
        this.alg_err = 0 //this is the error our algorithm currently has relative to the group ER


        // examples
        //this.examples = { //come back to this; need to set up prep times in exmples
        // go + feedback
        // calib: new BasicExample(this, 0, 200, false).setVisible(false),
        // basic: new BasicExample(this, 0, 200, true).setVisible(false)
        //}

        this.next_trial()
        this.raw_y = 0
        this.raw_x = 0

        // set up mouse callback (does all the heavy lifting)
        this.input.on('pointerdown', () => {
            if (this.state !== states.END) {
                !DEBUG && this.scale.startFullscreen()
                this.time.delayedCall(300, () => {
                    this.input.mouse.requestPointerLock()
                })
            }
            
        })
        this.input.on('pointerup', () => {
            this.input.off('pointermove', this.slider_move)
        })
        this.input.on('pointerlockchange', () => {
            console.log('oh no, this does not work')
        })

        this.ptr_cb = (ptr) => {
            if (this.input.mouse.locked) {
                let is_coalesced = 'getCoalescedEvents' in ptr
                // feature detect firefox (& ignore, see https://bugzilla.mozilla.org/show_bug.cgi?id=1753724)
                // TODO: detect first input & use as reference position for FF
                let not_ff = 'altitudeAngle' in ptr
                // AFAIK, Safari and IE don't support coalesced events
                // See https://developer.mozilla.org/en-US/docs/Web/API/PointerEvent
                let evts = is_coalesced && not_ff ? ptr.getCoalescedEvents() : [ptr]
                // console.log(evts.length)
                // the timestamps of ptr and the last event should match, and the
                // sum of all movements in evts should match ptr
                // console.log(ptr)
                // console.log(evts[evts.length - 1])
                for (let evt of evts) {
                    // only care about mouse movements in y
                    let dy = evt.movementY * MOVE_SCALE
                    let dx = evt.movementX * MOVE_SCALE
                    // console.log(`t: ${evt.timeStamp}, dxdy: (${dx}, ${dy})`)
                    // update "raw" mouse position (remember to set these back to (0, 0)
                    // when starting a new trial)
                    this.raw_y += dy
                    this.raw_x += dx
                    this.raw_y = clamp(this.raw_y, -hd2, hd2) //return to this-- an edge case is that ball intersects paddle only at the corner of the screen
                    this.raw_x = clamp(this.raw_x, -300, 300) //raw x only controls the scale

                    if (this.state === states.MOVING) { //can control paddle only if moving
                        this.movement_data.push({
                            evt_time: evt.timeStamp,
                            raw_y: this.raw_y
                        })
                        this.endpoint_y = this.raw_y //last update to this is the final position of the paddle
                        this.user_paddle.setPosition(PADDLE_X, clamp(this.raw_y, -0.8 * hd2 + this.paddle_radius, 0.8 *hd2 - this.paddle_radius))
                        
                        //this.user_paddle.y = this.raw_y - this.user_paddle.halfHeight
                        //this.user_paddle.y = clamp(this.user_paddle.y, -hd2, hd2-this.user_paddle.height) // center the paddle on the cursor y
                    }
                    if (this.happiness_thumb.visible) {
                        this.happiness_thumb.x = this.raw_x
                    }
                }
            }
        }

        document.addEventListener('pointermove', this.ptr_cb, { passive: true, capture: true })
        // initial instructions (move straight through target)
        instruct_txts['instruct_calib'] =
            `You will be playing a modified version of the game Pong! You control a paddle with your mouse/ trackpad and [color=#68e9e9]your goal is to try to make the puck hit the middle of the paddle[/color]. You will gain points if the paddle is placed in a spot where the puck will hit it. \n
        [color=#68e9e9]However, you must set the paddle before launching the puck,[/color] so you have to predict the future trajectory of the puck, and place the paddle in the right spot. Once you think the paddle is in the right spot, press SPACE to launch the puck and see how you did. The puck will automatically launch after 4s so think fast!`
        instruct_txts['instruct_basic'] =
            `Good job! Now, each trial will have different levels of difficulty, indicated by its color scheme. \n\n[color=#ffab0f]When the trial is this color, it will be harder to hit.[/color]\n\n[color=#04d9ff]When the trial is this color, it will be easier to hit.[/color]\n\nIf the puck hits the paddle, a coin toss will decide how many points you earn for the trial! Keep trying your hardest to hit the puck and maximize your points! \n
We'll ask you to rate your current happiness every few trials. Use your mouse to move the slider and press SPACE to submit.`
        instruct_txts['break'] = ` `
    } // end create

    update() {
        let current_trial = this.current_trial
        let height = this.game.config.height
        var hd2 = height / 2
        switch (this.state) {
            case states.INSTRUCT:
                if (this.entering) {
                    this.entering = false
                    this.launch_txt.visible = false
                    let tt = current_trial.trial_type

                    // show the right instruction text, wait until typing complete
                    // and response made
                    this.instructions.visible = true
                    this.darkener.visible = true
                    this.instructions.start(instruct_txts[tt], this.typing_speed)
                    if (tt === 'instruct_calib') {
                        //this.examples.calib.visible = true
                        //this.examples.calib.play()
                        this.points_total.visible = false
                    } else if (tt === 'instruct_basic' || tt === 'break') {
                        // this.examples.basic.visible = true
                        // this.examples.basic.play()
                        this.points_total.visible = false
                    }
                    this.instructions.typing.once('complete', () => {
                        if (tt == 'instruct_basic' || tt === 'break') {
                            this.happiness_thumb.x = 0
                            this.happiness_value = 50
                            if (tt === 'break') {
                                this.time.delayedCall(1000, () => {
                                    this.happiness_txt1.setVisible(true)
                                    this.happiness_txt2.setVisible(true)
                                    this.happiness_instruct.setVisible(true)
                                    this.happiness_scale.setVisible(true)
                                    this.happiness_thumb.setVisible(true)
                                    this.start_txt.visible = true
                                })
                            } else {
                                this.happiness_txt1.setVisible(true)
                                this.happiness_txt2.setVisible(true)
                                this.happiness_instruct.setVisible(true)
                                this.happiness_scale.setVisible(true)
                                this.happiness_thumb.setVisible(true)
                            }
                        }
                        this.time.delayedCall(500, () => {
                            if(tt !== 'break')
                                this.start_txt.visible = true
                            this.input.keyboard.once('keydown-SPACE', (evt) => {
                                //this.examples.basic.stop()
                                // this.examples.basic.visible = false
                                // this.examples.calib.stop()
                                // this.examples.calib.visible = false
                                this.instructions.visible = false
                                this.instructions.text = ''
                                this.start_txt.visible = false
                                this.happiness_txt1.visible = false
                                this.happiness_txt2.visible = false
                                this.happiness_instruct.visible = false
                                this.happiness_thumb.visible = false
                                this.happiness_scale.visible = false
                                this.happiness_value = Math.round(((this.happiness_thumb.x + 300) / 600) * 100)
                                this.game.user_config.last_rating = this.happiness_value
                                this.time.delayedCall(1000, () => {
                                    this.darkener.visible = false
                                })
                                this.next_trial()
                            }) //cant go immediately
                        })
                    })
                }
                break
            case states.PRETRIAL:
                if (this.entering) {
                    this.entering = false
                    //change the fillSyle of ball and paddle here to match the ER of the current trial
                    if (current_trial.er < 0.5) {
                        this.ball.setFillStyle(0x04d9ff)
                        this.user_paddle.setFillStyle(0x04d9ff)
                        this.ball_direction.strokeColor = 0x04d9ff
                        this.box.strokeColor = 0x04d9ff
                        this.paddle_radius = Math.min(fixErrorRate(this.rmse, this.current_trial.er), 0.8 *hd2/2) //hard limit to half the screen
                        this.user_paddle.setDisplaySize(15, 2 * this.paddle_radius)
                    } else if (current_trial.er > 0.5) {
                        this.ball.setFillStyle(0xffab0f)
                        this.user_paddle.setFillStyle(0xffab0f)
                        this.ball_direction.strokeColor = 0xffab0f
                        this.box.strokeColor = 0xffab0f
                        this.paddle_radius = Math.min(fixErrorRate(this.rmse, this.current_trial.er), 0.8 *hd2/2)
                        this.user_paddle.setDisplaySize(15, 2 * this.paddle_radius)
                    }
                    this.ball.visible = true
                    this.user_paddle.visible = true
                    this.points_total.visible = true
                    this.box.visible = true
                    this.ball.x = BALL_X
                    this.ball.y = current_trial.ball_y
                    this.ball_theta = current_trial.ball_theta
                    this.ball_direction.angle = 90-this.ball_theta
                    this.ball_direction.x = BALL_X
                    this.ball_direction.y = current_trial.ball_y
                    this.ball_direction.visible = true
                    if (current_trial.trial_type == 'calib' && this.trial_counter < 2) { //two trials of practice before staircasing starts...
                        this.ball_vx = current_trial.ball_vx
                        this.calib_vx = current_trial.ball_vx //calib_vx is not set initially, so this initializes it
                    }
                    else { //now staircase velocity if calib (see below) otherwise, keep using the calibrated velocity
                        this.ball_vx = this.calib_vx
                        this.current_trial.ball_vx = this.calib_vx //overwrite the trial order here so that correct velocity is saved
                    }

                    this.ball_vy = this.ball_vx * Math.tan(PI / 180 * this.ball_theta) //use ball_theta to get ball_vy; preserves theta regardless of vx
                    this.t_ref = window.performance.now()
                    this.movement_data = []
                    this.state = states.MOVING
                }
                break
            case states.MOVING:
                //now set paddle
                if (this.entering) {
                    this.launch_txt.setAlpha(1)
                    this.launch_txt.visible = true
                    this.reference_time = this.game.loop.now
                    this.last_frame_time = this.game.loop.now
                    this.dropped_frame_count = 0
                    this.dts = []
                    this.current_trial.bounces = 0;
                    // every trial starts at 0, 0
                    this.movement_data.splice(0, 0, {
                        evt_time: this.reference_time,
                        raw_y: 0
                    })
                    this.entering = false

                } else { // second iter ++
                    //this.ball_direction.visible = false
                    let est_dt = 1 / this.game.user_config.refresh_rate_est * 1000
                    let this_dt = this.game.loop.now - this.last_frame_time
                    this.dropped_frame_count += this_dt > 1.5 * est_dt
                    this.dts.push(this_dt)
                    this.last_frame_time = this.game.loop.now

                    //ball physics
                    //this.ball.x = this.ball.x - this.ball_vx * this_dt //speed is contingent on ms, not frames
                    //this.ball.y = this.ball.y + this.ball_vy * this_dt //speed is contingent on ms, not frames
                    //if (this.ball.y <= -hd2 + BALL_SIZE_RADIUS || this.ball.y >= hd2 - BALL_SIZE_RADIUS) {
                    //    this.ball_vy = -1 * this.ball_vy
                    //    this.current_trial.bounces = this.current_trial.bounces + 1; //this is a cheeky way of storing # of bounces
                    //}
                    //this keeps this.ball_theta as a readout directly from the trial table
                }
                //if (this.ball.x < 0)
                //    this.state = states.WAITING
                this.input.keyboard.once('keydown-SPACE', (evt) => {
                    this.launch_txt.setAlpha(0.5)
                    this.setting_time = this.game.loop.now - this.reference_time
                    this.state = states.WAITING
                })
                if (this.last_frame_time - this.reference_time >= 4000) {
                    this.launch_txt.setAlpha(0.5)
                    this.setting_time = 4000
                    this.state = states.WAITING
                }
                break;
            case states.WAITING:
                let est_dt = 1 / this.game.user_config.refresh_rate_est * 1000
                let this_dt = this.game.loop.now - this.last_frame_time
                this.dropped_frame_count += this_dt > 1.5 * est_dt
                this.dts.push(this_dt)
                this.last_frame_time = this.game.loop.now

                //ball physics
                this.ball.x = this.ball.x - this.ball_vx * this_dt //speed is contingent on ms, not frames
                this.ball.y = this.ball.y + this.ball_vy * this_dt //speed is contingent on ms, not frames
                if (this.ball.y < -0.8 * hd2 + BALL_SIZE_RADIUS || this.ball.y >= 0.8 *hd2 - BALL_SIZE_RADIUS) {
                    this.ball_vy = -1 * this.ball_vy
                    this.ball.y = clamp(this.ball.y, -0.8 * hd2 + BALL_SIZE_RADIUS + 1, 0.8 * hd2 - BALL_SIZE_RADIUS - 1)
                    this.current_trial.bounces = this.current_trial.bounces + 1;
                }
                //this keeps this.ball_theta as a readout directly from the trial table

                //check if ball collides with paddle
                if (Phaser.Geom.Rectangle.Overlaps(this.user_paddle.getBounds(), this.ball.getBounds())) {
                    //if (this.user_paddle.getBounds().contains(this.ball.x-this.ball.radius, this.ball.y)) {
                    console.log("PaddleX: " + this.user_paddle.x + "PaddleY: " + this.user_paddle.y + "PaddleH: " + this.user_paddle.displayHeight)
                    console.log("BallX: " + this.ball.x + "BallY: " + this.ball.y + "BallR: " + this.ball.radius)
                    this.success = true
                    this.ball.x = Math.max(this.ball.x, PADDLE_X + this.ball.radius)
                    this.state = states.POSTTRIAL
                }
                if (this.ball.x < PADDLE_X) {
                    console.log("PaddleX: " + this.user_paddle.x + "PaddleY: " + this.user_paddle.y + "PaddleH: " + this.user_paddle.displayHeight)
                    console.log("BallX: " + this.ball.x + "BallY: " + this.ball.y + "BallR: " + this.ball.radius)
                    if (this.user_paddle.getBounds().contains(PADDLE_X, this.ball.y)) {
                        this.success = true
                        this.ball.x = Math.max(this.ball.x, PADDLE_X + this.ball.radius)
                    }
                    else
                        this.success = false
                    this.ball.x = Math.max(this.ball.x, PADDLE_X - this.ball.radius)
                    this.state = states.POSTTRIAL
                }

                break;

            case states.POSTTRIAL:
                if (this.entering) {
                    this.entering = false
                    // deal with trial data
                    let trial_data = {
                        movement_data: this.movement_data,
                        ref_time: this.reference_time,
                        trial_number: this.trial_counter++,
                        endpoint_y: this.endpoint_y- this.ball.y,
                        dropped_frame_count: this.dropped_frame_count
                    }

                    let last_element = trial_data.movement_data[trial_data.movement_data.length - 1]
                    let combo_data = merge_data(current_trial, trial_data)
                    console.log("Combo Data: " + combo_data)
                    let delay = 500
                    let fbdelay = 1500
                    // feedback about movement angle (if non-imagery)

                    let punished = false
                    let punish_delay = 1000
                    let punish_flags = 0
                    if (punished) {
                        delay += punish_delay
                        this.other_warns.visible = true
                        this.time.delayedCall(punish_delay, () => {
                            this.other_warns.visible = false
                        })
                    } else {
                        //update hit and accuracy histories (error trials do not count for histories)
                        this.hit_history.shift()
                        this.hit_history.push(this.success ? 1 : 0)
                        this.acc_history.shift()
                        this.acc_history.push(this.endpoint_y - this.ball.y)
                        console.log("Accuracy History: " + this.acc_history)
                        this.rmse = findRMSE(this.acc_history)
                        console.log("RMSE: " + this.rmse)
                        this.hit_rate = this.hit_history.reduce((tot, curr) => {
                            if (Number.isFinite(curr)) {
                                return tot + curr
                            }
                        }) / this.hit_history.filter(v => Number.isFinite(v)).length
                        this.alg_err = 1 - this.current_trial.er - this.hit_rate //how far off is the algorith from the correct ER?
                        console.log("Algorithm Error: " + this.alg_err)
                        console.log("Hit Rate: " + this.hit_rate)
                        if (this.current_trial.is_ER_fixed) {
                            console.log("ER: " + this.current_trial.er)
                            console.log("Paddle Radius: " + this.paddle_radius)
                        }
                        else
                            this.paddle_radius = this.user_paddle.height / 2

                    }
                    combo_data['setting_time'] = this.setting_time
                    combo_data['success'] = punished ? NaN : +this.success
                    combo_data['hit_rate'] = this.hit_rate
                    combo_data['rmse'] = this.rmse
                    combo_data['alg_err'] = this.alg_err
                    combo_data['displ_rad'] = this.user_paddle.displayHeight / 2 //radius of target on current trial
                    combo_data['new_rad'] = this.paddle_radius //radius computed for next trial
                    combo_data['happiness'] = this.happiness_value
                    console.log("Happiness: " + this.happiness_value)

                    //success on main trials reveals lottery
                    if (this.current_trial.trial_type == 'basic' & this.success) {
                        var lottery_y = clamp(this.endpoint_y, -0.8 * hd2 + this.paddle_radius, 0.8 *hd2 - this.paddle_radius)
                        this.good_box.y = lottery_y
                        this.good_txt.y = lottery_y
                        this.bad_box.y = lottery_y
                        this.bad_txt.y = lottery_y
                        this.good_box.visible = this.bad_box.visible = this.good_txt.visible = this.bad_txt.visible = true
                    }

                    this.time.delayedCall(fbdelay, () => {
                        if (this.success & this.current_trial.trial_type == 'calib') {

                            this.pt_txt.text = '+' + current_trial.reward
                            this.pt_txt.setStyle({ fontFamily: 'Verdana', color: "#00ff00", fontSize: 50 })
                            //if(this.current_trial.reward ==10) this.pt_txt.setStyle({ color: "#ffffff" })
                            this.pt_txt.x = PADDLE_X + 100
                            this.pt_txt.y = clamp(this.endpoint_y, -0.8 * hd2 + this.paddle_radius, 0.8 *hd2 - this.paddle_radius)
                            this.pt_txt.visible = true
                            this.pt_total += current_trial.reward
                            this.points_total.text = "Total Points: " + this.pt_total
                            if (this.current_trial.trial_type == 'calib') {
                                //this.calib_vx += 0.05 //idk if this is fast enough -- this is the staircase
                            }
                        } else if (this.success & this.current_trial.trial_type == 'basic') {
                            if (this.current_trial.reward == 10) {
                                this.bad_txt.visible = this.bad_box.visible = false
                               // this.good_txt.setStyle({ color: "#00ff00" })
                            } else {
                                this.good_txt.visible = this.good_box.visible = false
                                //this.bad_txt.setStyle({ color: "#ff0000" })
                            }
                            this.pt_total += current_trial.reward
                            this.points_total.text = "Total Points: " + this.pt_total
                        }else {
                            //if (this.current_trial.trial_type == 'calib') {
                            //this.calib_vx -= 0.05
                            //this.calib_vx = Math.max(this.calib_vx, 0.05) //minimum velocity is 0.01
                            this.pt_txt.text = '0'
                            this.pt_txt.x = PADDLE_X + 100
                            this.pt_txt.y = clamp(this.ball.y, -0.8 * hd2 + 20, 0.8 *hd2-20)
                            this.pt_txt.setStyle({ fontFamily: 'Verdana', color: "#ff0000", fontSize: 50 })
                            this.pt_txt.visible = true
                        }
                        combo_data['score'] = this.pt_total
                        this.time.delayedCall(delay, () => {
                            combo_data['any_punishment'] = punished
                            combo_data['punish_types'] = punish_flags
                            this.user_paddle.setDisplaySize(15, 2 * this.paddle_radius)
                            this.raw_y = 0
                            this.raw_x = 0
                            this.user_paddle.setPosition(PADDLE_X, this.raw_y)
                            //this.user_paddle.y = last_element.raw_y - this.paddle_radius//ad hoc and can violate bounds of screen...
                            this.all_data[current_trial.trial_type].push(combo_data)
                            this.tmp_counter++
                            this.pt_txt.visible = false
                            this.good_box.visible = this.good_txt.visible = this.bad_box.visible = this.bad_txt.visible = false
                            //this.good_txt.setStyle({ color: '#ffffff' })
                            //this.bad_txt.setStyle({ color: '#ffffff' })
                            this.next_trial()
                        })
                    })
                }
                break
            case states.END:
                if (this.entering) {
                    this.entering = false
                    this.input.mouse.releasePointerLock()
                    document.removeEventListener('pointermove', this.ptr_cb, { passive: true, capture: true })
                    // fade out
                    this.tweens.addCounter({
                        from: 255,
                        to: 0,
                        duration: 2000,
                        onUpdate: (t) => {
                            let v = Math.floor(t.getValue())
                            this.cameras.main.setAlpha(v / 255)
                        },
                        onComplete: () => {
                            this.scene.start('EndScene', this.all_data)
                        }
                    })
                }
                break
        }
    } // end update

    get state() {
        return this._state
    }

    set state(newState) {
        this.entering = true
        this._state = newState
    }

    next_trial() {
        // move to the next trial, and set the state depending on trial_type
        if (this.tmp_counter > this.total_len) {
            this.progress.visible = false
        } else {
            this.progress.text = `${this.tmp_counter} / ${this.total_len}`
        }
        this.current_trial = this.trials.shift()
        let cur_trial = this.current_trial
        let tt = ''
        if (cur_trial !== undefined) {
            tt = cur_trial.trial_type
        }
        if (cur_trial === undefined || this.trials.length < 1 && !tt.startsWith('break')) {
            this.state = states.END
        } else if (tt.startsWith('instruct_') || tt.startsWith('break')) {
            this.state = states.INSTRUCT
        } else if (
            tt.startsWith('calib') ||
            tt.startsWith('basic')
        ) {
            this.state = states.PRETRIAL
        } else {
            // undefine
            console.error('Oh no, wrong next_trial.')
        }
    }

}
