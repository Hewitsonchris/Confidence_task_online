// Standard Normal variate using Box-Muller transform.
function gaussianRandom(mean=0, stdev=1) {
    let u = 1 - Math.random(); //Converting [0,1) to (0,1)
    let v = Math.random();
    let z = Math.sqrt( -2.0 * Math.log( u ) ) * Math.cos( 2.0 * Math.PI * v );
    // Transform to the desired mean and standard deviation:
    return z * stdev + mean;
}

function cryptoRand(){
    const array = new Uint32Array(1);
    self.crypto.getRandomValues(array);
    return array/4294967296
    }



/*
NB target distance is a constant in main
center sizes are consts in main


*/

/*
repeats (default 80) is number of repeats per clamp type
*/



export default function generateTrials(repeats = 80, CLAMP_ANGLE = 4) {

    //const FB_types = {
    //    mp: 1,
    //    ep: 2,
    //    online: 4
    //}
    // fb is bitshifted-- so, say you want online feedback + endpoint => 110 = 6

    let practice_reps = 0
    let aim_reps = 0
    let base_rep = 10
    let practice_report_reps = 10
    let report_reps = 100
    let clamp_reps = 0
    let rot_reps = 0
    let wash_reps = 20
    let targ_loc = 270
    let max_pert = 15;
    let step = 0.25
    let SD_pert = 2;


    let out = []
    out.push({ trial_type: 'instruct_basic' }) // first page
    for (let i = 0; i < base_rep; i++) {
        out.push({
            trial_type: 'practice_basic',
            aim: false, //does this trial have aim?
            rot_or_clamp: false, //'rot' 'clamp' or false (i.e. veridical fb)
            manip_angle: 0, //manipulation angle
            report: false,
            fb: 6, //see FB_types for key
            target_angle: targ_loc,
            cursor_cloud_sd: 0 //uncertainty condition. If sd = 0, then single curser is seen
        })
    }
    // out.push({ trial_type: 'instruct_aim' }) //aim instructions
    // for (let i = 0; i < aim_reps; i++) {
    //     out.push({
    //         trial_type: 'practice_aim',
    //         aim: true, //does this trial have aim?
    //         rot_or_clamp: false, //'rot' 'clamp' or false (i.e. veridical fb)
    //         manip_angle: 0, //manipulation angle
    //         fb: i%4 + 1, //see FB_types for key
    //         target_angle: targ_loc,
    //         cursor_cloud_sd: 0.5
    //     })
    // }

    out.push({ trial_type: 'instruct_report' }) //report instructions 
    for (let i = 0; i < practice_report_reps; i++) {
        out.push({
            trial_type: 'practice_report',
            aim: false, //does this trial have aim?
            rot_or_clamp: false, //'rot' 'clamp' or false (i.e. veridical fb)
            manip_angle: 0, //manipulation angle
            report: true,
            fb: 6, //see FB_types for key
            target_angle: targ_loc,
            cursor_cloud_sd: 0
        })
    }

   // out.push({ trial_type: 'instruct_report' }) //report instructions 
    for (let i = 0; i < report_reps; i++) {
        out.push({
            trial_type: 'adapt_report',
            aim: false, //does this trial have aim?
            rot_or_clamp: 'rot', //'rot' 'clamp' or false (i.e. veridical fb)
            manip_angle: -((15*cryptoRand() -7.5) + (Math.min(max_pert,i*step))), //manipulation angle
            report: true,
            fb: 6, //see FB_types for key
            target_angle: targ_loc,
            cursor_cloud_sd: 0
        })
    }

    // out.push({ trial_type: 'instruct_clamp' }) //clamp instructions (also disappearing target)
    // for (let i = 0; i < clamp_reps; i++) {
    //     out.push({
    //         trial_type: 'clamp',
    //         aim: false, //does this trial have aim?
    //         rot_or_clamp: 'clamp', //'rot' 'clamp' or false (i.e. veridical fb)
    //         manip_angle: 45, //manipulation angle
    //         fb: 6, //see FB_types for key
    //         target_angle: targ_loc,
    //         cursor_cloud_sd: 0.5
    //     })
    // }
    // out.push({ trial_type: 'instruct_rot' }) //rotation trial instructions (also disappearing target)
    // for (let i = 0; i < rot_reps; i++) {
    //     out.push({
    //         trial_type: 'rot',
    //         aim: false, //does this trial have aim?
    //         rot_or_clamp: 'rot', //'rot' 'clamp' or false (i.e. veridical fb)
    //         manip_angle:45, //manipulation angle
    //         fb: 6, //see FB_types for key
    //         target_angle: targ_loc,
    //         cursor_cloud_sd: 0.5
    //     })
    // }
    out.push({ trial_type: 'instruct_wash' }) //washout instructions 
    for (let i = 0; i < wash_reps; i++) {
        out.push({
            trial_type: 'wash',
            aim: false, //does this trial have aim?
            rot_or_clamp: false, //'rot' 'clamp' or false (i.e. veridical fb)
            manip_angle: 0, //manipulation angle
            fb: 0, //see FB_types for key
            target_angle: targ_loc,
            cursor_cloud_sd: 0
        })
    }
    return out
}
